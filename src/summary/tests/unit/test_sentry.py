"""Tests for the Sentry configuration.

Each test raises an error from code handling meeting content and inspects the
event Sentry would send: the content must be redacted, while harmless local
variables are kept for debugging.
"""

import json
from collections.abc import Callable, Iterator
from unittest.mock import Mock

import httpx
import openai
import pytest
import sentry_sdk
from botocore.exceptions import ClientError
from botocore.stub import Stubber
from sentry_sdk.transport import Transport

from summary.core import file_service
from summary.core import sentry as sentry_module
from summary.core.file_service import FileService
from summary.core.llm_service import LLMException, LLMService
from summary.core.shared_models import WhisperXResponse

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
        event_scrubber=sentry_module.build_event_scrubber(),
        default_integrations=False,
    )

    def flush() -> list[str]:
        sentry_sdk.flush()
        return transport.events

    yield flush
    sentry_sdk.init()  # Disable Sentry for the following tests


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
    """A failed S3 upload does not send the transcript, but keeps the job id."""
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
