"""Metadata agent that extracts metadata from active room."""

import asyncio
import json
import logging
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import List, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    JobRequest,
    RoomIO,
    WorkerPermissions,
    cli,
    utils,
)
from livekit.agents import (
    room_io as lk_room_io,
)
from livekit.plugins import silero

from exceptions import MissingConfigError
from observability import configure_sentry, set_job_context
from tasks import done_callback

load_dotenv()

logger = logging.getLogger("metadata-collector")

AGENT_NAME = os.getenv("METADATA_COLLECTOR_AGENT_NAME", "metadata-collector")
DEFAULT_S3_REGION_NAME = "us-east-1"


def prewarm(proc: JobProcess):
    """Preload voice activity detection model."""
    configure_sentry(AGENT_NAME)
    proc.userdata["vad"] = silero.VAD.load()


server = AgentServer(
    permissions=WorkerPermissions(
        can_publish=False,
        can_publish_data=False,
        can_subscribe=True,
        hidden=True,
    ),
)
server.setup_fnc = prewarm


def _build_s3_client(region_name: str):
    """Build an S3 client for the configured endpoint, signing for a region.

    The endpoint may be given with or without a scheme: the scheme always
    follows AWS_S3_SECURE_ACCESS.
    """
    endpoint = (
        os.getenv("AWS_S3_ENDPOINT_URL", "")
        .removeprefix("https://")
        .removeprefix("http://")
        .rstrip("/")
    )
    secure = os.getenv("AWS_S3_SECURE_ACCESS", "False").lower() == "true"

    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if secure else 'http'}://{endpoint}",
        aws_access_key_id=os.getenv("AWS_S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_S3_SECRET_ACCESS_KEY"),
        region_name=region_name,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def create_s3_client(bucket_name: str):
    """Create an S3 client signing for the bucket's region.

    When AWS_S3_REGION_NAME is not set, the region is looked up from the
    bucket, so that requests are signed for the region the provider expects.
    """
    region_name = os.getenv("AWS_S3_REGION_NAME")
    if not region_name:
        lookup_client = _build_s3_client(DEFAULT_S3_REGION_NAME)
        location = lookup_client.get_bucket_location(Bucket=bucket_name)
        region_name = location.get("LocationConstraint") or DEFAULT_S3_REGION_NAME

    return _build_s3_client(region_name)


@dataclass
class MetadataEvent:
    """A single timestamped event recorded during a meeting."""

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
        """Initialize with a participant identity and shared events list."""
        super().__init__(
            instructions="not-needed",
        )
        self.participant_identity = participant_identity
        self.events = events

    async def on_enter(self) -> None:
        """Initialize VAD monitoring for this participant."""

        @self.session.on("user_state_changed")
        def on_user_state(event):
            timestamp = datetime.now(timezone.utc)

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


class MetadataCollector:
    """Collect meeting events across all participants in a room.

    Creates one AgentSession per participant to capture VAD events
    (speech start/end), and listens for connection, disconnection,
    and chat events. Persists all collected events as JSON to S3
    on shutdown.
    """

    def __init__(self, ctx: JobContext, recording_id: str):
        """Initialize metadata agent."""
        if (bucket_name := os.getenv("AWS_STORAGE_BUCKET_NAME")) is not None:
            self.bucket_name = bucket_name
        else:
            raise MissingConfigError

        self.ctx = ctx
        self._sessions: dict[str, AgentSession] = {}
        self._tasks: set[asyncio.Task] = set()

        output_folder = os.getenv("AWS_S3_OUTPUT_FOLDER", "metadata")
        self.output_filename = f"{output_folder}/{recording_id}-metadata.json"

        # Storage for events
        self.events = []
        self.participants = {}

        logger.info("MetadataCollector initialized")

    def start(self):
        """Start listening for room-level events."""
        self.ctx.room.on("participant_disconnected", self.on_participant_disconnected)
        self.ctx.room.on("participant_name_changed", self.on_participant_name_changed)

        self.ctx.room.register_text_stream_handler("lk.chat", self.handle_chat_stream)

        logger.info("Started listening for participant events")

    async def on_chat_message_received(
        self, reader: rtc.TextStreamReader, participant_identity: str
    ):
        """Read a complete chat message and record it as an event."""
        full_text = await reader.read_all()
        logger.info("Received chat message from %s", participant_identity)

        self.events.append(
            MetadataEvent(
                participant_id=participant_identity,
                type="chat_received",
                timestamp=datetime.now(timezone.utc),
                data=full_text,
            )
        )

    def handle_chat_stream(self, reader, participant_identity):
        """Schedule async processing of an incoming chat stream."""
        task = asyncio.create_task(
            self.on_chat_message_received(reader, participant_identity)
        )
        self._tasks.add(task)
        task.add_done_callback(
            done_callback(
                logger,
                self._tasks,
                f"process chat stream from {participant_identity}",
            )
        )

    def save(self):
        """Serialize collected events and upload as JSON to S3."""
        logger.info("Persisting metadata...")

        participants = []
        for k, v in self.participants.items():
            participants.append({"participantId": k, "name": v})

        sorted_events = sorted(self.events, key=lambda e: e.timestamp)

        payload = {
            "events": [event.serialize() for event in sorted_events],
            "participants": participants,
        }

        data = json.dumps(payload, indent=2).encode("utf-8")

        try:
            create_s3_client(self.bucket_name).put_object(
                Bucket=self.bucket_name,
                Key=self.output_filename,
                Body=data,
                ContentType="application/json",
            )
            logger.info(
                "Uploaded speaker meeting metadata",
            )
        except (BotoCoreError, ClientError):
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

        self.ctx.room.off("participant_disconnected", self.on_participant_disconnected)
        self.ctx.room.off("participant_name_changed", self.on_participant_name_changed)

        logger.info("All VAD sessions closed")
        self.save()

    async def on_participant_entrypoint(
        self, ctx: JobContext, participant: rtc.RemoteParticipant
    ):
        """Handle new participant by starting a VAD monitoring session."""
        if participant.identity in self._sessions:
            logger.debug("Session already exists for %s", participant.identity)
            return

        self.events.append(
            MetadataEvent(
                participant_id=participant.identity,
                type="participant_connected",
                timestamp=datetime.now(timezone.utc),
            )
        )

        self.participants[participant.identity] = participant.name

        logger.info("New participant connected: %s", participant.identity)
        try:
            session = await self._start_session(participant)
            self._sessions[participant.identity] = session
        except Exception:
            logger.exception("Failed to start session for %s", participant.identity)

    def on_participant_disconnected(self, participant: rtc.RemoteParticipant):
        """Handle participant disconnection by closing VAD monitoring."""
        self.events.append(
            MetadataEvent(
                participant_id=participant.identity,
                type="participant_disconnected",
                timestamp=datetime.now(timezone.utc),
            )
        )

        session = self._sessions.pop(participant.identity, None)
        if session is None:
            logger.debug("No session found for %s", participant.identity)
            return

        logger.info("Participant disconnected: %s", participant.identity)
        task = asyncio.create_task(self._close_session(session))
        self._tasks.add(task)
        task.add_done_callback(
            done_callback(
                logger,
                self._tasks,
                f"close VAD session for {participant.identity}",
                on_success=lambda _: logger.info(
                    "VAD session closed for %s (remaining sessions: %d)",
                    participant.identity,
                    len(self._sessions),
                ),
            )
        )

    def on_participant_name_changed(self, participant: rtc.RemoteParticipant):
        """Update stored participant name when it changes."""
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
            options=lk_room_io.RoomOptions(
                audio_input=lk_room_io.AudioInputOptions(),
                text_input=False,
                audio_output=False,
                text_output=False,
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
            await session.aclose()
        except Exception:
            logger.exception("Error closing session")


async def handle_job_request(job_req: JobRequest) -> None:
    """Accept or reject the job request based on agent presence in the room."""
    room_name = job_req.room.name
    recording_id = job_req.job.metadata
    agent_identity = f"{AGENT_NAME}-{room_name}"

    async with api.LiveKitAPI() as lk:
        try:
            resp = await lk.room.list_participants(
                list=api.ListParticipantsRequest(room=room_name)
            )
            already_present = any(
                p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT
                and p.identity == agent_identity
                for p in resp.participants
            )
            if already_present:
                logger.info("Agent already in the room '%s' — reject", room_name)
                await job_req.reject()
            else:
                logger.info(
                    "Accept job for '%s' — identity=%s", room_name, agent_identity
                )
                await job_req.accept(identity=agent_identity, metadata=recording_id)
        except Exception:
            logger.exception("Error treating the job for '%s'", room_name)
            await job_req.reject()


@server.rtc_session(agent_name=AGENT_NAME, on_request=handle_job_request)
async def entrypoint(ctx: JobContext):
    """Initialize and run the metadata collector."""
    set_job_context(room=ctx.room.name, job_id=ctx.job.id)

    logger.info("Starting metadata agent in room: %s", ctx.room.name)
    recording_id = ctx.job.metadata
    metadata_collector = MetadataCollector(ctx, recording_id)
    metadata_collector.start()

    ctx.add_participant_entrypoint(metadata_collector.on_participant_entrypoint)

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    async def cleanup():
        logger.info("Shutting down metadata collector...")
        await metadata_collector.aclose()

    ctx.add_shutdown_callback(cleanup)


if __name__ == "__main__":
    # Initialize Sentry for the worker process. Each job runs in its own
    # (forked) process and re-initializes Sentry via prewarm().
    configure_sentry(AGENT_NAME)
    cli.run_app(server)
