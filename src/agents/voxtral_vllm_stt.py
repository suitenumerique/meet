"""LiveKit STT plugin for Voxtral Realtime served via vLLM (/v1/realtime).

vLLM exposes Voxtral Realtime over a WebSocket that follows the OpenAI Realtime
API protocol (not Mistral's proprietary realtime protocol).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import weakref
from collections import deque
from dataclasses import dataclass, field

import websockets
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    stt,
    utils,
)
from livekit.agents import (
    vad as vad_module,
)
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.agents.utils import is_given

logger = logging.getLogger("voxtral-vllm-stt")

SAMPLE_RATE = 16000
NUM_CHANNELS = 1
CHUNK_SAMPLES = 1600  # 100 ms @ 16 kHz mono
PREROLL_CHUNKS = 5  # keep 500 ms of audio before START_OF_SPEECH

# Reconnect policy: exponential backoff capped at MAX, give up after MAX_ATTEMPTS
# consecutive failures (a successful handshake resets the counter).
RECONNECT_BACKOFF_BASE_S = 0.5
RECONNECT_BACKOFF_MAX_S = 8.0
RECONNECT_MAX_ATTEMPTS = 5


@dataclass
class _STTOptions:
    base_url: str
    model: str
    api_key: str | None
    target_streaming_delay_ms: int | None


@dataclass
class _PendingUtterance:
    """An utterance in flight on the shared websocket.

    `sent_chunks` holds every chunk we have already enqueued for send on this
    or a prior connection; on reconnect we replay them before resuming reads
    from `queue`. vLLM concatenates `input_audio_buffer.append` events into a
    single audio buffer per generation, so duplicates from a partial prior send
    are harmless.
    """

    queue: asyncio.Queue[bytes | None]
    sent_chunks: list[bytes] = field(default_factory=list)
    ended: bool = False  # the None sentinel has been drained from `queue`


class STT(stt.STT):
    """LiveKit STT speaking the OpenAI Realtime protocol served by vLLM."""

    def __init__(
        self,
        *,
        base_url: NotGivenOr[str] = NOT_GIVEN,
        model: NotGivenOr[str] = NOT_GIVEN,
        api_key: NotGivenOr[str] = NOT_GIVEN,
        target_streaming_delay_ms: NotGivenOr[int] = NOT_GIVEN,
        vad: vad_module.VAD | None = None,
    ) -> None:
        """Build the STT.

        Args:
            base_url: WebSocket URL of the vLLM realtime endpoint, e.g.
                ws://example:8000/v1/realtime. Falls back to $VOXTRAL_VLLM_BASE_URL.
            model: Model name exposed by vLLM, default
                mistralai/Voxtral-Mini-4B-Realtime-2602.
            api_key: Optional bearer token. Falls back to $VOXTRAL_VLLM_API_KEY.
            target_streaming_delay_ms: Target streaming delay in ms forwarded to
                vLLM via session.update. Falls back to
                $VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS, else server default.
            vad: Voice Activity Detector. If omitted, Silero VAD is loaded.
        """
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=True, interim_results=True)
        )

        resolved_url = (
            base_url
            if is_given(base_url)
            else os.environ.get(
                "VOXTRAL_VLLM_BASE_URL", "ws://127.0.0.1:8000/v1/realtime"
            )
        )
        resolved_model = (
            model
            if is_given(model)
            else os.environ.get(
                "VOXTRAL_VLLM_MODEL", "mistralai/Voxtral-Mini-4B-Realtime-2602"
            )
        )
        resolved_key = (
            api_key if is_given(api_key) else os.environ.get("VOXTRAL_VLLM_API_KEY")
        )
        resolved_delay = (
            target_streaming_delay_ms
            if is_given(target_streaming_delay_ms)
            else (
                int(os.environ["VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS"])
                if os.environ.get("VOXTRAL_VLLM_TARGET_STREAMING_DELAY_MS")
                else None
            )
        )

        if vad is None:
            try:
                from livekit.plugins.silero import VAD as SileroVAD  # noqa: PLC0415
            except ImportError as exc:
                raise ImportError(
                    "livekit-plugins-silero is required for vLLM Voxtral realtime "
                    "(no server-side endpointing)."
                ) from exc
            vad = SileroVAD.load()
        self._vad = vad

        self._opts = _STTOptions(
            base_url=resolved_url, model=resolved_model, api_key=resolved_key
        )
        self._streams: weakref.WeakSet[SpeechStream] = weakref.WeakSet()

    @property
    def model(self) -> str:
        """Return the configured vLLM model name."""
        return self._opts.model

    @property
    def provider(self) -> str:
        """Return the provider identifier."""
        return "vllm-voxtral-realtime"

    async def _recognize_impl(self, *_args, **_kwargs) -> stt.SpeechEvent:
        raise NotImplementedError(
            "vLLM Voxtral Realtime STT only supports streaming recognition."
        )

    def stream(
        self,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> SpeechStream:
        """Open a new streaming recognition stream."""
        s = SpeechStream(
            stt=self,
            opts=self._opts,
            vad_instance=self._vad,
            conn_options=conn_options,
        )
        self._streams.add(s)
        return s


class SpeechStream(stt.RecognizeStream):
    def __init__(
        self,
        *,
        stt: STT,
        opts: _STTOptions,
        vad_instance: vad_module.VAD,
        conn_options: APIConnectOptions,
    ) -> None:
        """Init the speech stream."""
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=SAMPLE_RATE)
        self._opts = opts
        self._vad = vad_instance
        self._utterance_q: asyncio.Queue[bytes | None] | None = None
        self._speaking = False
        self._preroll: deque[bytes] = deque(maxlen=PREROLL_CHUNKS)
        # Voxtral realtime is strictly sequential: only one generation runs at a
        # time, and a new `commit` is ignored while the previous one is still
        # producing. We queue per-utterance audio buffers here and let the
        # pipeline process them one by one on the shared websocket.
        self._utterance_chan: asyncio.Queue[asyncio.Queue[bytes | None] | None] = (
            asyncio.Queue()
        )

    @utils.log_exceptions(logger=logger)
    async def _run(self) -> None:
        vad_stream = self._vad.stream()

        bstream = utils.audio.AudioByteStream(
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
            samples_per_channel=CHUNK_SAMPLES,
        )

        async def input_task() -> None:
            async for data in self._input_ch:
                if isinstance(data, self._FlushSentinel):
                    for frame in bstream.flush():
                        self._handle_chunk(frame.data.tobytes())
                    continue

                vad_stream.push_frame(data)
                for frame in bstream.write(data.data.tobytes()):
                    self._handle_chunk(frame.data.tobytes())

            vad_stream.end_input()

        async def vad_task() -> None:
            async for ev in vad_stream:
                if ev.type == vad_module.VADEventType.START_OF_SPEECH:
                    self._on_start_of_speech()
                elif ev.type == vad_module.VADEventType.END_OF_SPEECH:
                    self._on_end_of_speech()

        pipeline_t = asyncio.create_task(self._utterance_pipeline())
        try:
            await asyncio.gather(input_task(), vad_task())
            # signal end-of-stream; pipeline finishes pending utterances first
            self._utterance_chan.put_nowait(None)
            await pipeline_t
        except (APIStatusError, APIConnectionError, asyncio.CancelledError):
            raise
        except Exception as exc:
            logger.exception("vLLM realtime stream failed")
            raise APIConnectionError() from exc
        finally:
            if not pipeline_t.done():
                pipeline_t.cancel()
            try:
                await pipeline_t
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("utterance pipeline failed during finalize")
            await vad_stream.aclose()

    def _handle_chunk(self, chunk: bytes) -> None:
        self._preroll.append(chunk)
        if self._speaking and self._utterance_q is not None:
            self._utterance_q.put_nowait(chunk)

    def _on_start_of_speech(self) -> None:
        if self._speaking:
            return
        self._speaking = True
        q: asyncio.Queue[bytes | None] = asyncio.Queue()
        for chunk in self._preroll:
            q.put_nowait(chunk)
        self._utterance_q = q
        self._utterance_chan.put_nowait(q)
        self._event_ch.send_nowait(
            stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
        )

    def _on_end_of_speech(self) -> None:
        if not self._speaking:
            return
        self._speaking = False
        if self._utterance_q is not None:
            self._utterance_q.put_nowait(None)
        self._utterance_q = None
        self._event_ch.send_nowait(
            stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)
        )

    async def _handshake(self, ws: websockets.ClientConnection) -> str:
        created = json.loads(await ws.recv())
        if created.get("type") != "session.created":
            raise APIStatusError(
                f"expected session.created, got {created}",
                status_code=500,
                body=created,
            )
        await ws.send(json.dumps({"type": "session.update", "model": self._opts.model}))
        return created.get("id", "")

    def _auth_headers(self) -> dict[str, str]:
        if self._opts.api_key:
            return {"Authorization": f"Bearer {self._opts.api_key}"}
        return {}

    async def _utterance_pipeline(self) -> None:
        # Owns the websocket lifecycle. On drop, reopens and resumes the
        # in-flight utterance (if any) by replaying its already-sent chunks.
        pending: _PendingUtterance | None = None
        attempt = 0
        while True:
            try:
                async with websockets.connect(
                    self._opts.base_url,
                    additional_headers=self._auth_headers(),
                    open_timeout=self._conn_options.timeout,
                ) as ws:
                    request_id = await self._handshake(ws)
                    attempt = 0
                    while True:
                        if pending is None:
                            q = await self._utterance_chan.get()
                            if q is None:
                                return
                            pending = _PendingUtterance(queue=q)
                        await self._process_utterance(ws, pending, request_id)
                        pending = None
            except (websockets.WebSocketException, OSError, TimeoutError) as exc:
                attempt += 1
                if attempt > RECONNECT_MAX_ATTEMPTS:
                    logger.exception(
                        "vLLM realtime: giving up after %d reconnect attempts",
                        RECONNECT_MAX_ATTEMPTS,
                    )
                    raise APIConnectionError() from exc
                backoff = min(
                    RECONNECT_BACKOFF_BASE_S * (2 ** (attempt - 1)),
                    RECONNECT_BACKOFF_MAX_S,
                )
                if pending is None:
                    logger.warning(
                        "vLLM WS connection lost between utterances "
                        "(attempt %d/%d): %s; retrying in %.1fs",
                        attempt,
                        RECONNECT_MAX_ATTEMPTS,
                        exc,
                        backoff,
                    )
                else:
                    logger.warning(
                        "vLLM WS dropped mid-utterance (%d chunks buffered, "
                        "ended=%s, attempt %d/%d): %s; retrying in %.1fs",
                        len(pending.sent_chunks),
                        pending.ended,
                        attempt,
                        RECONNECT_MAX_ATTEMPTS,
                        exc,
                        backoff,
                    )
                await asyncio.sleep(backoff)

    async def _process_utterance(
        self,
        ws: websockets.ClientConnection,
        pending: _PendingUtterance,
        request_id: str,
    ) -> None:
        # Start a fresh generation. Safe to send here: the previous utterance's
        # transcription.done has already been received (we await it below), so
        # the server-side generation_task is done and won't ignore this commit.
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        send_t = asyncio.create_task(self._send_audio(ws, pending))
        try:
            await self._receive_one_transcription(ws, request_id)
        finally:
            if not send_t.done():
                send_t.cancel()
            try:
                await send_t
            except (asyncio.CancelledError, websockets.WebSocketException):
                pass
            except Exception:
                logger.exception("send-audio task failed during finalize")

    @staticmethod
    async def _send_audio(
        ws: websockets.ClientConnection, pending: _PendingUtterance
    ) -> None:
        # Replay anything already sent on a previous (now-dead) connection.
        # sent_chunks is appended before send, so a chunk that failed to send
        # last time is still present and gets retried here.
        for chunk in pending.sent_chunks:
            await ws.send(
                json.dumps(
                    {
                        "type": "input_audio_buffer.append",
                        "audio": base64.b64encode(chunk).decode("ascii"),
                    }
                )
            )
        if pending.ended:
            await ws.send(
                json.dumps({"type": "input_audio_buffer.commit", "final": True})
            )
            return
        while True:
            chunk = await pending.queue.get()
            if chunk is None:
                pending.ended = True
                await ws.send(
                    json.dumps({"type": "input_audio_buffer.commit", "final": True})
                )
                return
            pending.sent_chunks.append(chunk)
            await ws.send(
                json.dumps(
                    {
                        "type": "input_audio_buffer.append",
                        "audio": base64.b64encode(chunk).decode("ascii"),
                    }
                )
            )

    async def _receive_one_transcription(
        self, ws: websockets.ClientConnection, request_id: str
    ) -> None:
        # Use recv() rather than `async for`: the latter swallows
        # ConnectionClosed on close-mid-iteration, which would let a dropped
        # WS look like a clean "no transcription" return.
        current_text = ""
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            event_type = data.get("type")

            if event_type == "transcription.delta":
                delta = data.get("delta", "")
                if not delta:
                    continue
                current_text += delta
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                        request_id=request_id,
                        alternatives=[stt.SpeechData(text=current_text, language="")],
                    )
                )
            elif event_type == "transcription.done":
                final_text = data.get("text") or current_text
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                        request_id=request_id,
                        alternatives=[stt.SpeechData(text=final_text, language="")],
                    )
                )
                usage = data.get("usage") or {}
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.RECOGNITION_USAGE,
                        request_id=request_id,
                        recognition_usage=stt.RecognitionUsage(
                            audio_duration=float(
                                usage.get("audio_seconds")
                                or usage.get("prompt_audio_seconds")
                                or 0
                            ),
                            input_tokens=int(usage.get("prompt_tokens") or 0),
                            output_tokens=int(usage.get("completion_tokens") or 0),
                        ),
                    )
                )
                return
            elif event_type == "error":
                err = data.get("error")
                raise APIStatusError(str(err), status_code=500, body=data)
