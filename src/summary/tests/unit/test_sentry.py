"""Tests for the Sentry configuration.

Each test raises an error from code handling meeting content and inspects the
event Sentry would send: sensitive content is redacted and useful locals remain.
"""

import json
import logging
from collections.abc import Callable, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest.mock import Mock

import httpx
import openai
import pytest
import requests
import sentry_sdk
from botocore.exceptions import ClientError
from botocore.stub import Stubber
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.stdlib import StdlibIntegration
from sentry_sdk.transport import Transport

from summary.core import file_service, webhook_service
from summary.core import sentry as sentry_module
from summary.core.file_service import FileService, FileServiceException
from summary.core.llm_service import LLMException, LLMService
from summary.core.shared_models import SummarizeWebhookSuccessPayload, WhisperXResponse

CANARY = "CANARY-MEETING-CONTENT"

SentryEvents = Callable[[], list[str]]


class _CapturingTransport(Transport):
    """Keep serialized events in memory instead of sending them."""

    def __init__(self):
        super().__init__()
        self.events: list[str] = []

    def capture_envelope(self, envelope):
        """Store each serialized event of the envelope."""
        for item in envelope.items:
            if item.type == "event":
                self.events.append(item.payload.get_bytes().decode())


@pytest.fixture
def sentry_events() -> Iterator[SentryEvents]:
    """Initialize Sentry as in production, with an in-memory transport."""
    transport = _CapturingTransport()
    sentry_sdk.init(
        dsn="https://public@sentry.example.com/1",
        transport=transport,
        send_default_pii=False,
        include_local_variables=True,
        before_send=sentry_module.before_send,
        before_breadcrumb=sentry_module.before_breadcrumb,
        event_scrubber=sentry_module.build_event_scrubber(),
        default_integrations=False,
        integrations=[
            LoggingIntegration(level=logging.DEBUG, event_level=None),
            StdlibIntegration(),
        ],
    )

    def flush() -> list[str]:
        sentry_sdk.flush()
        return transport.events

    yield flush
    sentry_sdk.init()  # Disable Sentry for the following tests


@pytest.fixture
def missing_recording_url() -> Iterator[str]:
    """Serve a deterministic 404 through the real instrumented HTTP client."""

    class MissingRecordingHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(404)
            self.end_headers()

        def log_message(self, format, *args):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), MissingRecordingHandler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield (
                f"http://127.0.0.1:{server.server_port}/recordings/recording-123.mp4"
                f"?X-Amz-Credential={CANARY}-credential"
                f"&X-Amz-Signature={CANARY}-signature"
            )
        finally:
            server.shutdown()
            thread.join()


def test_sentry_download_404_excludes_signed_url(
    sentry_events: SentryEvents, missing_recording_url: str, caplog
) -> None:
    """A failed download excludes signed URLs from logs, locals and breadcrumbs."""
    with caplog.at_level(logging.INFO):
        try:
            FileService()._download_from_cloud_storage_url(missing_recording_url)
        except FileServiceException as exc:
            assert exc.__cause__ is None
            assert exc.__suppress_context__
            sentry_sdk.capture_exception()
        else:
            pytest.fail("the download should have failed")

    [event] = sentry_events()
    assert CANARY not in event
    assert CANARY not in caplog.text
    assert "/recordings/recording-123.mp4?[redacted]" in caplog.text
    parsed = json.loads(event)
    assert [item["type"] for item in parsed["exception"]["values"]] == [
        "FileServiceException"
    ]
    download_vars = next(
        frame_vars for frame_vars in _local_vars(event) if "extension" in frame_vars
    )
    assert download_vars["extension"] == "'.mp4'"
    assert download_vars["cloud_storage_url"] == "[Filtered]"
    breadcrumbs = parsed["breadcrumbs"]["values"]
    assert any(crumb.get("type") == "http" for crumb in breadcrumbs)
    assert any(
        crumb.get("category") == "summary.core.file_service" for crumb in breadcrumbs
    )
    assert all("message" not in crumb and "data" not in crumb for crumb in breadcrumbs)


def test_sentry_chained_http_error_excludes_signed_url(
    sentry_events: SentryEvents, missing_recording_url: str
) -> None:
    """Sentry also filters signed URLs in explicitly chained HTTP errors."""
    try:
        try:
            response = requests.get(missing_recording_url, timeout=5)
            response.raise_for_status()
        except requests.HTTPError as exc:
            raise FileServiceException("Download failed") from exc
    except FileServiceException:
        sentry_sdk.capture_exception()

    [event] = sentry_events()
    assert CANARY not in event
    exceptions = json.loads(event)["exception"]["values"]
    assert [item["type"] for item in exceptions] == [
        "HTTPError",
        "FileServiceException",
    ]
    assert all(item["value"] == "[Filtered]" for item in exceptions)


def test_sentry_excludes_webhook_debug_content(
    sentry_events: SentryEvents, monkeypatch, settings_override, caplog
) -> None:
    """Raw DEBUG responses stay in application logs and out of Sentry events."""
    monkeypatch.setattr(webhook_service, "settings", settings_override)
    signed_url = f"https://storage.example.com/result?signature={CANARY}"
    response = Mock(status_code=200)
    response.json.return_value = {
        "id": "document-123",
        "content": CANARY,
        "url": signed_url,
    }
    monkeypatch.setattr(webhook_service.requests, "post", Mock(return_value=response))
    with caplog.at_level(logging.DEBUG):
        webhook_service.call_webhook_v2(
            tenant_id="test-tenant",
            payload=SummarizeWebhookSuccessPayload(
                job_id="job", summary_data_url=signed_url
            ),
        )
        try:
            raise RuntimeError("A later failure")
        except RuntimeError:
            sentry_sdk.capture_exception()

    assert CANARY in caplog.text
    [event] = sentry_events()
    assert CANARY not in event
    assert any(
        crumb.get("category") == "summary.core.webhook_service"
        and crumb.get("level") == "debug"
        for crumb in json.loads(event)["breadcrumbs"]["values"]
    )


def _transcript() -> WhisperXResponse:
    return WhisperXResponse.model_validate(
        {
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.0,
                    "text": f"I don't know {CANARY}",
                    "speaker": "SPEAKER_01",
                    "words": [
                        {
                            "word": CANARY,
                            "start": 0.0,
                            "end": 1.0,
                            "score": 0.9,
                            "speaker": "SPEAKER_01",
                        }
                    ],
                }
            ]
        }
    )


def _local_vars(event: str) -> list[dict]:
    """Return the local variables of every frame of the event."""
    return [
        frame.get("vars", {})
        for exception in json.loads(event)["exception"]["values"]
        for frame in exception["stacktrace"]["frames"]
    ]


@pytest.fixture
def s3_stubber(monkeypatch: pytest.MonkeyPatch) -> Iterator[Stubber]:
    """Stub the S3 client built by the file service."""
    monkeypatch.setattr(
        file_service,
        "settings",
        file_service.settings.model_copy(
            update={
                "aws_s3_endpoint_url": "garage:9000",
                "aws_s3_secure_access": False,
                "aws_s3_region_name": "fr-par",
                "aws_storage_bucket_name": "meet-media-storage",
            }
        ),
    )
    stubber = Stubber(file_service._build_s3_client())
    stubber.activate()
    monkeypatch.setattr(file_service, "_build_s3_client", lambda: stubber.client)
    yield stubber
    stubber.assert_no_pending_responses()


def test_sentry_store_transcript_failure_redacts_transcript(
    sentry_events: SentryEvents, s3_stubber: Stubber
) -> None:
    """A failed S3 upload redacts the transcript while retaining useful locals."""
    s3_stubber.add_client_error("put_object", service_error_code="InvalidDigest")

    try:
        FileService().store_transcript(transcript=_transcript(), job_id="job-1")
    except ClientError:
        sentry_sdk.capture_exception()
    else:
        pytest.fail("store_transcript should have failed")

    [event] = sentry_events()
    assert CANARY not in event

    store_transcript_vars = next(
        frame_vars
        for frame_vars in _local_vars(event)
        if "transcript_path" in frame_vars
    )
    assert store_transcript_vars["job_id"] == "'job-1'"
    assert store_transcript_vars["transcript_path"] == "'transcripts/job-1.json'"
    assert store_transcript_vars["data"] == "[Filtered]"
    assert store_transcript_vars["transcript"] == "[Filtered]"


def test_sentry_llm_failure_redacts_prompts(sentry_events: SentryEvents) -> None:
    """A failed LLM call does not send the prompts, even from OpenAI internals."""
    client = openai.OpenAI(
        api_key="test-key",
        base_url="https://llm.example.com/v1",
        max_retries=0,
        http_client=httpx.Client(
            transport=httpx.MockTransport(lambda request: httpx.Response(500))
        ),
    )
    observability = Mock(is_enabled=False)
    observability.get_openai_client.return_value = client

    try:
        LLMService(observability).call(
            system_prompt="Summarize this meeting.",
            user_prompt=f"Transcript: {CANARY}",
            name="tldr",
        )
    except LLMException:
        sentry_sdk.capture_exception()
    else:
        pytest.fail("the LLM call should have failed")

    [event] = sentry_events()
    assert CANARY not in event


def test_init_sentry_uses_the_event_scrubber(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sentry is initialized with local variables and the content scrubber."""
    settings = sentry_module.get_settings().model_copy(
        update={"sentry_is_enabled": True, "sentry_dsn": "https://k@example.com/1"}
    )
    monkeypatch.setattr(sentry_module, "get_settings", lambda: settings)
    init = Mock()
    monkeypatch.setattr(sentry_module.sentry_sdk, "init", init)

    sentry_module.init_sentry()

    init.assert_called_once()
    kwargs = init.call_args.kwargs
    assert kwargs["send_default_pii"] is False
    assert kwargs["max_request_body_size"] == "never"
    assert kwargs["include_local_variables"] is True
    denylist = kwargs["event_scrubber"].denylist
    assert {"data", "transcript", "content", "summary", "password"} <= set(denylist)


def test_init_sentry_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sentry is not initialized when disabled."""
    settings = sentry_module.get_settings().model_copy(
        update={"sentry_is_enabled": False, "sentry_dsn": "https://k@example.com/1"}
    )
    monkeypatch.setattr(sentry_module, "get_settings", lambda: settings)
    init = Mock()
    monkeypatch.setattr(sentry_module.sentry_sdk, "init", init)

    sentry_module.init_sentry()

    init.assert_not_called()
