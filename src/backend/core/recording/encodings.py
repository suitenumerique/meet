"""Encoding presets for per-recording quality configuration.

To add a new profile: add one entry to AUDIO_BITRATE_MAP and one row in ENCODING_MAP.
To add a new resolution: add one entry to RESOLUTION_MAP and one row in ENCODING_MAP.
No control-flow changes needed anywhere else.
"""

# pylint: disable=no-member

# (fps, video_kbps) keyed by (resolution, profile)
# Bitrate scales with resolution so quality remains consistent across sizes.
ENCODING_MAP = {
    ("540p", "talking_heads"): (15, 400),
    ("540p", "text"): (15, 600),
    ("540p", "mixed"): (20, 900),
    ("720p", "talking_heads"): (15, 700),
    ("720p", "text"): (15, 1000),
    ("720p", "mixed"): (20, 1500),
    ("1080p", "talking_heads"): (15, 1200),
    ("1080p", "text"): (15, 1800),
    ("1080p", "mixed"): (20, 2500),
}

# Maps resolution string → (width, height) in pixels
RESOLUTION_MAP = {
    "540p": (960, 540),
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}

# Audio bitrate per profile in kbps (resolution has no effect on audio)
AUDIO_BITRATE_MAP = {
    "talking_heads": 64,
    "text": 64,
    "mixed": 96,
}

# Default keyframe interval in seconds (standard VOD value)
DEFAULT_KEY_FRAME_INTERVAL = 4.0
