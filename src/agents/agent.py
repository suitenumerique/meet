import logging

from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
)

load_dotenv()

logger = logging.getLogger("transcriber")


async def entrypoint(ctx: JobContext):
    logger.info(f"starting transcriber (speech to text) example, room: {ctx.room.name}")

    @ctx.room.on("active_speakers_changed")
    def on_room_event(
        speakers
    ):
        logger.debug("active speaker changed $$")
        if not speakers:
            logger.debug("None")
        for speaker in speakers:
            logger.debug(speaker)

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="test"))

