"""Transcribe / summary Shared / Webhook models."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter


class WordSegment(BaseModel):
    """Word segment model for transcription tasks."""

    word: str = Field(title="Word")
    start: float = Field(title="Start Time", description="Start time in seconds.")
    end: float = Field(title="End Time", description="End time in seconds.")
    score: float | None = Field(
        title="Confidence Score", description="Confidence score for the word segment."
    )
    speaker: str | None = Field(
        title="Speaker", description="Speaker identifier for the word segment."
    )


class Segment(BaseModel):
    """Segment model for transcription tasks."""

    start: float = Field(title="Start Time", description="Start time in seconds.")
    end: float = Field(title="End Time", description="End time in seconds.")
    text: str = Field(
        title="Segment Text", description="Transcribed text for the segment."
    )
    words: tuple[WordSegment, ...] | None = Field(
        title="Word Segments", description="List of word segments within the segment."
    )
    speaker: str | None = Field(
        title="Speaker", description="Speaker identifier for the segment."
    )


class WhisperXResponse(BaseModel):
    """Model for WhisperX response."""

    segments: tuple[Segment, ...] = Field(
        title="Segments", description="List of transcribed segments."
    )
    word_segments: tuple[WordSegment, ...] = Field(
        title="Word Segments", description="List of word segments."
    )


class BaseWebhook(BaseModel):
    """Base webhook payload."""

    job_id: str = Field(
        title="Job ID",
        description="The ID of the job document in the receiver system.",
    )


class TranscribeWebhookSuccessPayload(BaseWebhook):
    """Payload for a successful transcription webhook."""

    type: Literal["transcript"] = Field(default="transcript")
    status: Literal["success"] = Field(default="success")
    transcription_data_url: str = Field(
        title="Transcript", description="URL to the raw transcription data."
    )


class TranscribeWebhookFailurePayload(BaseWebhook):
    """Payload for a failed transcription webhook."""

    type: Literal["transcript"] = Field(default="transcript")
    status: Literal["failure"] = Field(default="failure")
    error_code: Literal["unknown_error"] = Field(
        title="Error code", description="The error code."
    )


TranscribeWebhookPayloads = Annotated[
    Union[TranscribeWebhookSuccessPayload, TranscribeWebhookFailurePayload],
    Field(discriminator="status"),
]


class SummarizeWebhookSuccessPayload(BaseWebhook):
    """Payload for a successful summarization webhook."""

    type: Literal["summary"] = Field(default="summary")
    status: Literal["success"] = Field(default="success")
    summary: str = Field(title="Summary", description="The summary of the text.")


class SummarizeWebhookFailurePayload(BaseWebhook):
    """Payload for a failed summarization webhook."""

    type: Literal["summary"] = Field(default="summary")
    status: Literal["failure"] = Field(default="failure")
    error_code: Literal["unknown_error"] = Field(
        title="Error code", description="The error code."
    )


SummarizeWebhookPayloads = Annotated[
    Union[SummarizeWebhookSuccessPayload, SummarizeWebhookFailurePayload],
    Field(discriminator="status"),
]

WebhookPayloads = Annotated[
    Union[TranscribeWebhookPayloads, SummarizeWebhookPayloads],
    Field(discriminator="type"),
]


webhook_payload_adapter = TypeAdapter(WebhookPayloads)

__all__ = [
    "TranscribeWebhookSuccessPayload",
    "TranscribeWebhookFailurePayload",
    "SummarizeWebhookSuccessPayload",
    "SummarizeWebhookFailurePayload",
    "TranscribeWebhookPayloads",
    "SummarizeWebhookPayloads",
    "WebhookPayloads",
    "WhisperXResponse",
]
