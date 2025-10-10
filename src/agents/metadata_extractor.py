"""Metadata agent that extracts metadata from active room."""

import asyncio
import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    RoomInputOptions,
    RoomIO,
    RoomOutputOptions,
    WorkerOptions,
    cli,
    utils,
)
from livekit.plugins import silero
from minio import Minio
from minio.error import S3Error

load_dotenv()

logger = logging.getLogger("metadata-extractor")

AGENT_NAME = os.getenv("ROOM_METADATA_AGENT_NAME", "metadata-extractor")


@dataclass
class MetadataEvent:
    """Wip."""

    participant_id: str
    type: str
    timestamp: datetime
    data: Optional[str] = None

    def serialize(self) -> dict:
        """Return a JSON-serializable dictionary representation of the event."""
        data = asdict(self)
        data["timestamp"] = self.timestamp.isoformat()
        return data


class VADAgent(Agent):
    """Agent that monitors voice activity for a specific participant."""

    def __init__(self, participant_identity: str, events: List):
        """Wip."""
        super().__init__(
            instructions="not-needed",
        )
        self.participant_identity = participant_identity
        self.events = events

    async def on_enter(self) -> None:
        """Initialize VAD monitoring for this participant."""
        @self.session.on("user_state_changed")
        def on_user_state(event):
            timestamp = datetime.now()

            if event.new_state == "speaking":
                event = MetadataEvent(
                    participant_id=self.participant_identity,
                    type="speech_start",
                    timestamp=timestamp,
                )
                self.events.append(event)

            elif event.old_state == "speaking":
                event = MetadataEvent(
                    participant_id=self.participant_identity,
                    type="speech_end",
                    timestamp=timestamp,
                )
                self.events.append(event)


class MetadataAgent:
    """Monitor and manage real-time metadata extraction from meeting rooms.

    Oversees VAD (Voice Activity Detection) and participant metadata streams
    to track and analyze real-time events, coordinating data collection across
    participants for insights like speaking activity and engagement.
    """

    def __init__(self, ctx: JobContext):
        """Initialize metadata agent."""
        self.minio_client = Minio(
            endpoint=os.getenv("AWS_S3_ENDPOINT_URL"),
            access_key=os.getenv("AWS_S3_ACCESS_KEY_ID"),
            secret_key=os.getenv("AWS_S3_SECRET_ACCESS_KEY"),
            secure=os.getenv("AWS_S3_SECURE_ACCESS", "False").lower() == "true",
        )

        # todo - raise error if none
        self.bucket_name = os.getenv("AWS_STORAGE_BUCKET_NAME")

        self.ctx = ctx
        self._sessions: dict[str, AgentSession] = {}
        self._tasks: set[asyncio.Task] = set()

        # Storage for events
        self.events = []
        self.participants = {}

        logger.info("MetadataAgent initialized")

    def start(self):
        """Start listening for participant connection events."""
        self.ctx.room.on("participant_connected", self.on_participant_connected)
        self.ctx.room.on("participant_disconnected", self.on_participant_disconnected)
        self.ctx.room.on("participant_name_changed", self.on_participant_name_changed)

        self.ctx.room.register_text_stream_handler("lk.chat", self.handle_chat_stream)

        logger.info("Started listening for participant events")

    async def on_chat_message_received(self, reader: rtc.TextStreamReader, participant_identity: str):
        """Wip."""
        full_text = await reader.read_all()
        logger.info("Received chat message from %s: '%s'", participant_identity, full_text)

        self.events.append(
            MetadataEvent(
                participant_id=participant_identity,
                type="chat_received",
                timestamp=datetime.now(),
                data=full_text
            )
        )

    def handle_chat_stream(self, reader, participant_identity):
        """Wip."""
        task = asyncio.create_task(self.on_chat_message_received(reader, participant_identity))
        self._tasks.add(task)
        task.add_done_callback(lambda _: self._tasks.remove(task))

    def save(self):
        """Wip."""
        logger.info("Persisting processed metadata output to disk…")

        participants = []
        for k, v in self.participants.items():
            participants.append({"participantId": k, "name": v})

        sorted_event = sorted(self.events, key=lambda e: e.timestamp)

        payload = {
            "events": [event.serialize() for event in sorted_event],
            "participants": participants,
        }

        object_name = f"speaker_logs/{str(uuid.uuid4())}.json"
        data = json.dumps(payload, indent=2).encode("utf-8")

        stream = BytesIO(data)

        try:
            self.minio_client.put_object(
                self.bucket_name,
                object_name,
                stream,
                length=len(data),
                content_type="application/json",
            )
            logger.info(
                "Uploaded speaker meeting metadata",
            )
        except S3Error:
            logger.exception(
                "Failed to upload meeting metadata",
            )

    async def aclose(self):
        """Close all sessions and cleanup resources."""
        logger.info("Closing all VAD monitoring sessions…")

        await utils.aio.cancel_and_wait(*self._tasks)

        await asyncio.gather(
            *[self._close_session(session) for session in self._sessions.values()],
            return_exceptions=True,
        )

        self.ctx.room.off("participant_connected", self.on_participant_connected)
        self.ctx.room.off("participant_disconnected", self.on_participant_disconnected)
        self.ctx.room.off("participant_name_changed", self.on_participant_name_changed)

        logger.info("All VAD sessions closed")
        self.save()

    def on_participant_connected(self, participant: rtc.RemoteParticipant):
        """Handle new participant connection by starting VAD monitoring."""
        if participant.identity in self._sessions:
            logger.debug("Session already exists for %s", participant.identity)
            return

        self.events.append(
            MetadataEvent(
                participant_id=participant.identity,
                type="participant_connected",
                timestamp=datetime.now(),
            )
        )

        self.participants[participant.identity] = participant.name

        logger.info("New participant connected: %s", participant.identity)
        task = asyncio.create_task(self._start_session(participant))
        self._tasks.add(task)

        def on_task_done(task: asyncio.Task):
            try:
                self._sessions[participant.identity] = task.result()
            except Exception:
                logger.exception("Failed to start session for %s", participant.identity)
            finally:
                self._tasks.discard(task)

        task.add_done_callback(on_task_done)

    def on_participant_disconnected(self, participant: rtc.RemoteParticipant):
        """Handle participant disconnection by closing VAD monitoring."""
        self.events.append(
            MetadataEvent(
                participant_id=participant.identity,
                type="participant_disconnected",
                timestamp=datetime.now(),
            )
        )

        session = self._sessions.pop(participant.identity, None)
        if session is None:
            logger.debug("No session found for %s", participant.identity)
            return

        logger.info("Participant disconnected: %s", participant.identity)
        task = asyncio.create_task(self._close_session(session))
        self._tasks.add(task)

        def on_close_done(_):
            self._tasks.discard(task)
            logger.info(
                "VAD session closed for %s (remaining sessions: %d)",
                participant.identity,
                len(self._sessions),
            )

        task.add_done_callback(on_close_done)

    def on_participant_name_changed(self, participant: rtc.RemoteParticipant):
        """Wip."""
        logger.info("Participant's name changed: %s", participant.identity)
        self.participants[participant.identity] = participant.name

    async def _start_session(self, participant: rtc.RemoteParticipant) -> AgentSession:
        """Create and start VAD monitoring session for participant."""
        if participant.identity in self._sessions:
            return self._sessions[participant.identity]

        # Create session with VAD only - no STT, LLM, or TTS
        session = AgentSession(
            vad=self.ctx.proc.userdata["vad"],
            turn_detection="vad",
            user_away_timeout=30.0,
        )

        # Set up room IO to receive audio from this specific participant
        room_io = RoomIO(
            agent_session=session,
            room=self.ctx.room,
            participant=participant,
            input_options=RoomInputOptions(
                audio_enabled=True,
                text_enabled=False,
            ),
            output_options=RoomOutputOptions(
                audio_enabled=False,
                transcription_enabled=False,
            ),
        )

        await room_io.start()
        await session.start(
            agent=VADAgent(
                participant_identity=participant.identity, events=self.events
            )
        )

        return session

    async def _close_session(self, session: AgentSession) -> None:
        """Close and cleanup VAD monitoring session."""
        try:
            await session.drain()
            await session.aclose()
        except Exception:
            logger.exception("Error closing session")


async def entrypoint(ctx: JobContext):
    """Initialize and run the multi-user VAD monitor."""
    logger.info("Starting metadata agent in room: %s", ctx.room.name)

    vad_monitor = MetadataAgent(ctx)
    vad_monitor.start()

    # Connect to room and subscribe to audio only
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    existing_participants = list(ctx.room.remote_participants.values())
    for participant in existing_participants:
        vad_monitor.on_participant_connected(participant)

    async def cleanup():
        logger.info("Shutting down VAD monitor...")
        await vad_monitor.aclose()

    ctx.add_shutdown_callback(cleanup)


def prewarm(proc: JobProcess):
    """Preload voice activity detection model."""
    proc.userdata["vad"] = silero.VAD.load()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )
