"""Multi user transcription agent."""

import asyncio
import logging
import os

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    JobRequest,
    RoomInputOptions,
    RoomIO,
    RoomOutputOptions,
    WorkerOptions,
    WorkerPermissions,
    cli,
    utils,
)
from livekit.plugins import deepgram, silero

load_dotenv()

logger = logging.getLogger("transcriber")

TRANSCRIBER_AGENT_NAME = os.getenv("TRANSCRIBER_AGENT_NAME", "multi-user-transcriber")

# Default Deepgram STT configuration
DEEPGRAM_STT_DEFAULTS = {
    "model": "nova-3",
    "language": "multi",
}

# Supported parameters for LiveKit's deepgram.STT() in streaming mode
# Note: Not all Deepgram API parameters are supported by the LiveKit plugin
# detect_language is NOT supported for real-time streaming
# Use language="multi" instead for automatic multilingual support
DEEPGRAM_STT_SUPPORTED_PARAMS = {
    "model",
    "language",
}


def _build_deepgram_stt_kwargs():
    """Build Deepgram STT kwargs from DEEPGRAM_STT_* environment variables.

    Only parameters supported by LiveKit's deepgram.STT() are included.
    Unsupported parameters are logged as warnings.
    """
    stt_kwargs = DEEPGRAM_STT_DEFAULTS.copy()

    # Scan environment variables for DEEPGRAM_STT_* pattern
    for key, value in os.environ.items():
        if key.startswith("DEEPGRAM_STT_"):
            # Extract parameter name and convert to lowercase
            param_name = key.replace("DEEPGRAM_STT_", "", 1).lower()

            # Check if parameter is supported by LiveKit plugin
            if param_name not in DEEPGRAM_STT_SUPPORTED_PARAMS:
                supported = ", ".join(sorted(DEEPGRAM_STT_SUPPORTED_PARAMS))
                logger.warning(
                    f"Ignoring unsupported Deepgram STT parameter: {param_name}. "
                    f"Supported parameters: {supported}"
                )
                continue

            # Parse value type
            value_lower = value.lower()
            if value_lower in ("true", "false"):
                # Boolean values
                stt_kwargs[param_name] = value_lower == "true"
            elif value.isdigit():
                # Integer values
                stt_kwargs[param_name] = int(value)
            else:
                # String values
                stt_kwargs[param_name] = value

    logger.info(f"Deepgram STT configuration: {stt_kwargs}")
    return stt_kwargs


class Transcriber(Agent):
    """Create a transcription agent for a specific participant."""

    def __init__(self, *, participant_identity: str):
        """Init transcription agent."""
        # Build STT configuration from environment variables
        stt_kwargs = _build_deepgram_stt_kwargs()

        super().__init__(
            instructions="not-needed",
            stt=deepgram.STT(**stt_kwargs),
        )
        self.participant_identity = participant_identity


class MultiUserTranscriber:
    """Manage transcription sessions for multiple room participants."""

    def __init__(self, ctx: JobContext):
        """Init multi user transcription agent."""
        self.ctx = ctx
        self._sessions: dict[str, AgentSession] = {}
        self._tasks: set[asyncio.Task] = set()

    def start(self):
        """Start listening for participant connection events."""
        self.ctx.room.on("participant_connected", self.on_participant_connected)
        self.ctx.room.on("participant_disconnected", self.on_participant_disconnected)

    async def aclose(self):
        """Close all sessions and cleanup resources."""
        await utils.aio.cancel_and_wait(*self._tasks)

        await asyncio.gather(
            *[self._close_session(session) for session in self._sessions.values()]
        )

        self.ctx.room.off("participant_connected", self.on_participant_connected)
        self.ctx.room.off("participant_disconnected", self.on_participant_disconnected)

    def on_participant_connected(self, participant: rtc.RemoteParticipant):
        """Handle new participant connection by starting transcription session."""
        if participant.identity in self._sessions:
            return

        logger.info(f"starting session for {participant.identity}")
        task = asyncio.create_task(self._start_session(participant))
        self._tasks.add(task)

        def on_task_done(task: asyncio.Task):
            try:
                self._sessions[participant.identity] = task.result()
            finally:
                self._tasks.discard(task)

        task.add_done_callback(on_task_done)

    def on_participant_disconnected(self, participant: rtc.RemoteParticipant):
        """Handle participant disconnection by closing transcription session."""
        if (session := self._sessions.pop(participant.identity)) is None:
            return

        logger.info(f"closing session for {participant.identity}")
        task = asyncio.create_task(self._close_session(session))
        self._tasks.add(task)
        task.add_done_callback(lambda _: self._tasks.discard(task))

    async def _start_session(self, participant: rtc.RemoteParticipant) -> AgentSession:
        """Create and start transcription session for participant."""
        if participant.identity in self._sessions:
            return self._sessions[participant.identity]

        session = AgentSession(
            vad=self.ctx.proc.userdata["vad"],
        )
        room_io = RoomIO(
            agent_session=session,
            room=self.ctx.room,
            participant=participant,
            input_options=RoomInputOptions(
                text_enabled=False,
            ),
            output_options=RoomOutputOptions(
                transcription_enabled=True,
                audio_enabled=False,
            ),
        )
        await room_io.start()
        await session.start(
            agent=Transcriber(
                participant_identity=participant.identity,
            )
        )
        return session

    async def _close_session(self, sess: AgentSession) -> None:
        """Close and cleanup transcription session."""
        await sess.drain()
        await sess.aclose()


async def entrypoint(ctx: JobContext):
    """Initialize and run the multi-user transcriber."""
    transcriber = MultiUserTranscriber(ctx)
    transcriber.start()

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    for participant in ctx.room.remote_participants.values():
        transcriber.on_participant_connected(participant)

    async def cleanup():
        await transcriber.aclose()

    ctx.add_shutdown_callback(cleanup)


async def handle_transcriber_job_request(job_req: JobRequest) -> None:
    """Accept job if no transcriber exists in room, otherwise reject."""
    room_name = job_req.room.name
    transcriber_id = f"{TRANSCRIBER_AGENT_NAME}-{room_name}"

    async with api.LiveKitAPI() as lkapi:
        try:
            response = await lkapi.room.list_participants(
                list=api.ListParticipantsRequest(room=room_name)
            )

            transcriber_exists = any(
                p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
                and p.identity == transcriber_id
                for p in response.participants
            )

            if transcriber_exists:
                logger.info(f"Transcriber exists in {room_name} - rejecting")
                await job_req.reject()
            else:
                logger.info(f"Accepting job for {room_name}")
                await job_req.accept(identity=transcriber_id)

        except Exception:
            logger.exception(f"Error processing job for {room_name}")
            await job_req.reject()


def prewarm(proc: JobProcess):
    """Preload voice activity detection model."""
    proc.userdata["vad"] = silero.VAD.load()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=handle_transcriber_job_request,
            prewarm_fnc=prewarm,
            agent_name=TRANSCRIBER_AGENT_NAME,
            permissions=WorkerPermissions(hidden=True),
        )
    )
