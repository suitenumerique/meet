"""Encoding presets for per-recording quality configuration.

To add a new profile: add one entry to PROFILE_MAP.
To add a new resolution: add one entry to RESOLUTION_MAP.
No control-flow changes needed anywhere else.
"""

# pylint: disable=no-member

from livekit import api as livekit_api

# Maps resolution string → (width, height) in pixels
RESOLUTION_MAP = {
    "1080p": (1920, 1080),
    "720p": (1280, 720),
    "540p": (960, 540),
}

# Maps profile string → (framerate fps, video_kbps, audio_kbps)
# Values come from the reference profiles table in docs/features/recording.md
PROFILE_MAP = {
    "low_cpu": (15, 600, 64),
    "slide_heavy": (15, 900, 64),
    "balanced": (20, 1000, 96),
}

# Default keyframe interval in seconds (standard VOD value)
DEFAULT_KEY_FRAME_INTERVAL = 4.0


def resolve_encoding_options(encoding_config) -> livekit_api.EncodingOptions | None:
    """
    Convert a validated EncodingConfig pydantic object into a LiveKit EncodingOptions.

    Returns None if encoding_config is None, which means "use global settings or
    LiveKit default" — the caller handles that case.
    """
    if encoding_config is None:
        return None

    # Resolution: use from config or fall back to 720p
    if encoding_config.resolution:
        width, height = RESOLUTION_MAP[encoding_config.resolution]
    else:
        width, height = RESOLUTION_MAP["720p"]

    # Profile: use from config or fall back to balanced
    if encoding_config.profile:
        fps, video_kbps, audio_kbps = PROFILE_MAP[encoding_config.profile]
    else:
        fps, video_kbps, audio_kbps = PROFILE_MAP["balanced"]

    return livekit_api.EncodingOptions(
        width=width,
        height=height,
        framerate=fps,
        video_bitrate=video_kbps,
        audio_bitrate=audio_kbps,
        key_frame_interval=DEFAULT_KEY_FRAME_INTERVAL,
    )


def resolve_audio_encoding_options(
    encoding_config,
) -> livekit_api.EncodingOptions | None:
    """
    Convert a validated EncodingConfig into EncodingOptions for audio-only egress.

    Audio-only transcript recordings ignore `resolution` and video settings;
    only the profile's audio bitrate is applied.
    """
    if encoding_config is None:
        return None

    if encoding_config.profile:
        _, _, audio_kbps = PROFILE_MAP[encoding_config.profile]
    else:
        _, _, audio_kbps = PROFILE_MAP["balanced"]

    return livekit_api.EncodingOptions(audio_bitrate=audio_kbps)
