"""Visible room join agent (for connection/testing) + JSON speaker intervals per participant."""

import logging
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
import json
import pathlib

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

load_dotenv()
logger = logging.getLogger("visible-joiner")
logger.setLevel(logging.INFO)
logger.propagate = False

if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s %(name)s - %(message)s"))
    logger.addHandler(_h)
VISIBLE_AGENT_NAME = os.getenv("VISIBLE_AGENT_NAME", "visible-joiner")


class SpeakerTracker:
    def __init__(self, room_name: str, write_json: bool = True):
        self.room_name = room_name
        self.active_since: Dict[str, datetime] = {}
        self.by_participant: Dict[str, List[dict]] = {}
        self.write_json_flag = write_json

        ts = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        outdir = pathlib.Path("./speaker_logs")
        outdir.mkdir(parents=True, exist_ok=True)
        self.json_path: Optional[pathlib.Path] = outdir / f"speakers_{room_name}_{ts}.json" if write_json else None

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
        now = self._now()
        start = self.active_since.pop(identity, None)
        if start:
            self._emit_interval(identity, start, now)

    def flush_all(self):
        now = self._now()
        for ident, start in list(self.active_since.items()):
            self._emit_interval(ident, start, now)
        self.active_since.clear()

    def build_json(self) -> dict:
        return {
            "room": self.room_name,
            "generated_at": self._now().isoformat(),
            "by_participant": self.by_participant,
        }

    def write_json(self):
        if not self.write_json_flag or not self.json_path:
            return
        payload = self.build_json()
        logger.info("Writing speaker intervals JSON to %s", self.json_path)
        with self.json_path.open("w") as f:
            json.dump(payload, f, indent=2)


async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    lp = ctx.room.local_participant
    logger.info(
        "Connected to SFU; room=%s identity=%s sid=%s",
        ctx.room.name,
        getattr(lp, "identity", "<unknown>"),
        getattr(lp, "sid", "<unknown>"),
    )

    tracker = SpeakerTracker(ctx.room.name, write_json=True)

    def _on_participant_connected(p: rtc.RemoteParticipant):
        logger.info("remote participant connected: %s (%s)", p.identity, p.sid)

    def _on_active_speakers_changed(speakers: list[rtc.Participant]):
        idents = [p.identity for p in speakers]
        logger.info("active speakers changed: %s", idents)
        tracker.update_active_speakers(idents)

    def _on_participant_disconnected(p: rtc.RemoteParticipant):
        logger.info("remote participant disconnected: %s", p.identity)
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
    room_name = job_req.room.name
    agent_identity = f"{VISIBLE_AGENT_NAME}-{room_name}"

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
                logger.info("Accept job for '%s' — identity=%s", room_name, agent_identity)
                await job_req.accept(identity=agent_identity)
        except Exception:
            logger.exception("Error treating the job for '%s'", room_name)
            await job_req.reject()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            request_fnc=handle_job_request,
            agent_name=VISIBLE_AGENT_NAME,
            permissions=WorkerPermissions(),
        )
    )