"""Metadata agent that tracks active speakers and their speaking intervals."""

import json
import logging
import os
import pathlib
from datetime import datetime, timezone
from io import BytesIO
from typing import Dict, List, Optional

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobRequest,
    WorkerOptions,
    WorkerPermissions,
    cli,
)
from minio import Minio
from minio.error import S3Error

load_dotenv()

logger = logging.getLogger("metadata-joiner")
logger.setLevel(logging.INFO)
logger.propagate = False

if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(
        logging.Formatter("%(asctime)s - %(levelname)s %(name)s - %(message)s")
    )
    logger.addHandler(_h)
AGENT_NAME = os.getenv("ROOM_METADATA_AGENT_NAME", "metadata-extractor")


def _parse_display_from_metadata(meta: Optional[str]) -> Optional[str]:
    if not meta:
        return None
    try:
        m = json.loads(meta)
        for k in ("display_name", "displayName", "name"):
            if isinstance(m, dict) and m.get(k):
                return str(m[k])
    except Exception as e:
        logger.debug("Failed to parse participant metadata", exc_info=e)
    return None


def pretty_name(p: rtc.Participant) -> str:
    """Get the name for a participant.

    Preference order: name attribute, metadata display_name, identity.
    """
    if getattr(p, "name", None):
        return p.name
    dn = _parse_display_from_metadata(getattr(p, "metadata", None))
    return dn or p.identity


class SpeakerTracker:
    """Track active speakers and their speaking intervals."""

    def __init__(
        self,
        room_name: str,
        write_json: bool = True,
        recording_id: Optional[str] = None,
    ):
        """Track active speakers and their speaking intervals."""
        self.room_name = room_name
        self.active_since: Dict[str, datetime] = {}
        self.by_participant: Dict[str, List[dict]] = {}
        self.write_json_flag = write_json
        self.display_names: Dict[str, str] = {}

        outdir = pathlib.Path("./speaker_logs")
        outdir.mkdir(parents=True, exist_ok=True)
        self.recording_id = recording_id

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _emit_interval(self, identity: str, start: datetime, end: datetime):
        dur = max(0.0, (end - start).total_seconds())
        seg = {
            "start_iso": start.isoformat(),
            "end_iso": end.isoformat(),
            "duration_sec": round(dur, 3),
        }
        self.by_participant.setdefault(identity, []).append(seg)

    def update_active_speakers(self, current_identities: List[str]):
        """Update the list of currently active speakers."""
        now = self._now()
        current = set(current_identities)
        before = set(self.active_since.keys())

        for ident in current - before:
            self.active_since[ident] = now

        for ident in before - current:
            start = self.active_since.pop(ident, None)
            if start:
                self._emit_interval(ident, start, now)

    def on_participant_disconnected(self, identity: str):
        """Handle participant disconnection by finalizing their active interval."""
        now = self._now()
        start = self.active_since.pop(identity, None)
        if start:
            self._emit_interval(identity, start, now)

    def flush_all(self):
        """Flush all active speakers as ended now."""
        now = self._now()
        for ident, start in list(self.active_since.items()):
            self._emit_interval(ident, start, now)
        self.active_since.clear()

    def build_json(self) -> dict:
        """Build JSON with names instead of participant ids as keys."""
        by_name = {
            self.display_names.get(pid, pid) or pid: segments
            for pid, segments in self.by_participant.items()
        }
        return {
            "room": self.room_name,
            "generated_at": self._now().isoformat(),
            "by_participant": by_name,
        }

    def write_json(self):
        """Write the collected speaker intervals to a JSON file and upload to MinIO."""

        def _as_bool(v: str, default=False):
            if v is None:
                return default
            return v.strip().lower() in ("1", "true", "yes", "y")

        if not self.write_json_flag:
            return
        payload = self.build_json()

        minio_client = Minio(
            endpoint=os.getenv("AWS_S3_ENDPOINT_URL"),
            access_key=os.getenv("AWS_S3_ACCESS_KEY_ID"),
            secret_key=os.getenv("AWS_S3_SECRET_ACCESS_KEY"),
            secure=_as_bool(os.getenv("AWS_S3_SECURE_ACCESS", "false")),
        )

        bucket = "meet-media-storage"

        object_name = f"speaker_logs/speakers_{self.recording_id}.json"
        data = json.dumps(payload, indent=2).encode("utf-8")

        stream = BytesIO(data)

        try:
            minio_client.put_object(
                bucket,
                object_name,
                stream,
                length=len(data),
                content_type="application/json",
            )
            logger.info(
                "Uploaded speaker intervals JSON to s3://%s/%s", bucket, object_name
            )
        except S3Error:
            logger.exception(
                "Failed to upload JSON to bucket=%s object=%s", bucket, object_name
            )


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the metadata extractor agent."""
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    rec_id = None
    try:
        raw = getattr(ctx.job, "metadata", None)
        if raw:
            rec_id = json.loads(raw).get("recording_id")
    except Exception:
        logger.debug("No/invalid recording_id in job metadata", exc_info=True)

    lp = ctx.room.local_participant
    logger.info(
        "Connected to SFU; room=%s identity=%s sid=%s",
        ctx.room.name,
        getattr(lp, "identity", "<unknown>"),
        getattr(lp, "sid", "<unknown>"),
    )

    tracker = SpeakerTracker(ctx.room.name, write_json=True, recording_id=rec_id)

    def _on_participant_connected(p: rtc.RemoteParticipant):
        dn = pretty_name(p)
        logger.info("remote participant connected: %s (%s)", dn, p.sid)
        tracker.display_names[p.identity] = dn

    def _on_active_speakers_changed(speakers: list[rtc.Participant]):
        idents = [p.identity for p in speakers]
        for p in speakers:
            tracker.display_names[p.identity] = pretty_name(p)
        logger.info(
            "active speakers changed: %s",
            [tracker.display_names.get(i, i) for i in idents],
        )
        tracker.update_active_speakers(idents)

    def _on_participant_disconnected(p: rtc.RemoteParticipant):
        logger.info(
            "remote participant disconnected: %s",
            tracker.display_names.get(p.identity, p.identity),
        )
        tracker.on_participant_disconnected(p.identity)

    if not ctx.proc.userdata.get("events_registered"):
        ctx.room.on("participant_connected", _on_participant_connected)
        ctx.room.on("active_speakers_changed", _on_active_speakers_changed)
        ctx.room.on("participant_disconnected", _on_participant_disconnected)
        ctx.proc.userdata["events_registered"] = True

    async def cleanup():
        if ctx.proc.userdata.get("events_registered"):
            ctx.room.off("participant_connected", _on_participant_connected)
            ctx.room.off("active_speakers_changed", _on_active_speakers_changed)
            ctx.room.off("participant_disconnected", _on_participant_disconnected)
            ctx.proc.userdata["events_registered"] = False
        tracker.flush_all()
        tracker.write_json()

    ctx.add_shutdown_callback(cleanup)


async def handle_job_request(job_req: JobRequest) -> None:
    """Accept or reject the job request based on agent presence in the room."""
    room_name = job_req.room.name
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
                await job_req.accept(identity=agent_identity)
        except Exception:
            logger.exception("Error treating the job for '%s'", room_name)
            await job_req.reject()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=handle_job_request,
            agent_name=AGENT_NAME,
            permissions=WorkerPermissions(
                can_publish=False,
                can_publish_data=False,
                can_subscribe=True,
                hidden=True,
            ),
        )
    )
