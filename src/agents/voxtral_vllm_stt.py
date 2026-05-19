"""LiveKit STT plugin for Voxtral Realtime served via vLLM (/v1/realtime).

vLLM exposes Voxtral Realtime over a WebSocket that follows the OpenAI Realtime
API protocol (not Mistral's proprietary realtime protocol).
"""

import asyncio
import base64
import json
import logging
import os
import weakref
from collections import deque
from dataclasses import dataclass

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


@dataclass
class _STTOptions:
    base_url: str
    model: str
    api_key: str | None


class STT(stt.STT):
    """LiveKit STT speaking the OpenAI Realtime protocol served by vLLM."""

    def __init__(
        self,
        *,
        base_url: NotGivenOr[str] = NOT_GIVEN,
        model: NotGivenOr[str] = NOT_GIVEN,
        api_key: NotGivenOr[str] = NOT_GIVEN,
        vad: vad_module.VAD | None = None,
    ) -> None:
        """Build the STT.

        Args:
            base_url: WebSocket URL of the vLLM realtime endpoint, e.g.
                ws://example:8000/v1/realtime. Falls back to $VOXTRAL_VLLM_BASE_URL.
            model: Model name exposed by vLLM, default
                mistralai/Voxtral-Mini-4B-Realtime-2602.
            api_key: Optional bearer token. Falls back to $VOXTRAL_VLLM_API_KEY.
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
        self._inflight: set[asyncio.Task] = set()

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

        try:
            await asyncio.gather(input_task(), vad_task())
            if self._inflight:
                await asyncio.gather(*self._inflight, return_exceptions=True)
        finally:
            for task in self._inflight:
                if not task.done():
                    task.cancel()
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
        self._event_ch.send_nowait(
            stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
        )
        task = asyncio.create_task(self._run_utterance(q))
        self._inflight.add(task)
        task.add_done_callback(self._inflight.discard)

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

    async def _run_utterance(self, q: asyncio.Queue[bytes | None]) -> None:
        headers: dict[str, str] = {}
        if self._opts.api_key:
            headers["Authorization"] = f"Bearer {self._opts.api_key}"

        try:
            async with websockets.connect(
                self._opts.base_url,
                additional_headers=headers,
                open_timeout=self._conn_options.timeout,
            ) as ws:
                request_id = await self._handshake(ws)

                send_t = asyncio.create_task(self._send_audio(ws, q))
                try:
                    await self._receive_events(ws, request_id)
                finally:
                    if not send_t.done():
                        send_t.cancel()
                    try:
                        await send_t
                    except asyncio.CancelledError:
                        pass
                    except Exception:
                        logger.exception("send-audio task failed during finalize")
        except (APIStatusError, APIConnectionError, asyncio.CancelledError):
            raise
        except Exception as exc:
            logger.exception("vLLM realtime utterance failed")
            raise APIConnectionError() from exc

    async def _handshake(self, ws: websockets.ClientConnection) -> str:
        created = json.loads(await ws.recv())
        if created.get("type") != "session.created":
            raise APIStatusError(
                f"expected session.created, got {created}",
                status_code=500,
                body=created,
            )
        await ws.send(json.dumps({"type": "session.update", "model": self._opts.model}))
        await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
        return created.get("id", "")

    @staticmethod
    async def _send_audio(
        ws: websockets.ClientConnection, q: asyncio.Queue[bytes | None]
    ) -> None:
        while True:
            chunk = await q.get()
            if chunk is None:
                await ws.send(
                    json.dumps({"type": "input_audio_buffer.commit", "final": True})
                )
                return
            await ws.send(
                json.dumps(
                    {
                        "type": "input_audio_buffer.append",
                        "audio": base64.b64encode(chunk).decode("ascii"),
                    }
                )
            )

    async def _receive_events(
        self, ws: websockets.ClientConnection, request_id: str
    ) -> None:
        current_text = ""
        async for raw in ws:
            data = json.loads(raw)
            event_type = data.get("type")

            if event_type == "transcription.delta":
                # TODO: fix this
                current_text += data.get("delta", "")
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
