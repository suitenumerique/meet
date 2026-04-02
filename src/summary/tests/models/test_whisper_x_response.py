"""Tests for WhisperXResponse."""

from summary.core.shared_models import WhisperXResponse


def test_whisper_x_response_partial_response_is_valid():
    """A partial response from WhisperX is valid.

    Sometimes WhisperX Api doesn't return all the data and timestamps,
    we don't want to fail the whole process.
    """
    WhisperXResponse.model_validate(
        {
            "segments": [
                {
                    "start": 1.135,
                    "end": 7.3,
                    "text": " Test 1, 2, 3... Est-?",
                    "words": [
                        {
                            "word": "Test",
                            "start": 1.135,
                            "end": 2.216,
                            "score": 0.654,
                            "speaker": "SPEAKER_00",
                        },
                        {
                            "word": "1,",
                            "start": None,
                            "end": None,
                            "score": None,
                            "speaker": None,
                        },
                        {
                            "word": "2,",
                            "start": None,
                            "end": None,
                            "score": None,
                            "speaker": None,
                        },
                        {
                            "word": "3...",
                        },
                    ],
                    "speaker": "SPEAKER_00",
                }
            ],
            "word_segments": [
                {
                    "word": "Test",
                    "start": 1.135,
                    "end": 2.216,
                    "score": 0.654,
                    "speaker": "SPEAKER_00",
                },
                {"word": "1,"},
                {"word": "?"},
            ],
        }
    )
