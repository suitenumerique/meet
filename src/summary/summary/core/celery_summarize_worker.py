"""Celery summarize workers."""

from celery import Celery, signals
from celery.utils.log import get_task_logger
import openai
from requests import Session
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from summary.core.prompt import (
    PROMPT_SYSTEM_PLAN,
    PROMPT_SYSTEM_TLDR,
    PROMPT_SYSTEM_PART,
    PROMPT_USER_PART,
    PROMPT_SYSTEM_CLEANING,
    PROMPT_SYSTEM_NEXT_STEP,
)
from summary.core.config import get_settings
from summary.core.celery_app import celery

settings = get_settings()
logger = get_task_logger(__name__)


def create_retry_session():
    """Create an HTTP session configured with retry logic."""
    session = Session()
    retries = Retry(
        total=settings.webhook_max_retries,
        backoff_factor=settings.webhook_backoff_factor,
        status_forcelist=settings.webhook_status_forcelist,
        allowed_methods={"POST"},
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session


def post_with_retries(url, data):
    """Send POST request with automatic retries."""
    session = create_retry_session()
    session.headers.update({"Authorization": f"Bearer {settings.webhook_api_token}"})
    try:
        response = session.post(url, json=data)
        response.raise_for_status()
        return response
    finally:
        session.close()


def LLM_call(client, system_prompt, user_prompt, retry=2):

    data = {
        "model": "Qwen/Qwen2.5-Coder-32B-Instruct-AWQ",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    try:
        response = client.chat.completions.create(**data)
        print(response)
        return response.choices[0].message.content
    except Exception as e:
        if retry > 0:
            print(f"Erreur lors de l'appel à l'API : {e}. Nouvelle tentative...")
            return LLM_call(system_prompt, user_prompt, retry=retry - 1)
        else:
            print(f"Erreur lors de l'appel à l'API : {e}")
            return False


@celery.task(
    bind=True, autoretry_for=[Exception], max_retries=3, queue="summarize_queue"
)
def summarize_transcription(self, transcript: str, email: str, sub: str, title: str):
    logger.info("Starting summarization task")

    prompt_system_TLDR = PROMPT_SYSTEM_TLDR
    prompt_system_plan = PROMPT_SYSTEM_PLAN
    prompt_system_part = PROMPT_SYSTEM_PART

    logger.info("Initiating summarize client")

    client_summary = openai.OpenAI(
        base_url=settings.resume_endpoint, api_key=settings.resume_api_key
    )

    out = LLM_call(client_summary, prompt_system_TLDR, transcript)

    logger.info("TLDR generated")

    parts = LLM_call(client_summary, prompt_system_plan, transcript)
    logger.info("Plan generated")

    parts = parts.split("\n")
    parts = [x for x in parts if x.strip() != ""]
    logger.info("Empty parts removed")

    parts_summarized = []
    for part in parts:
        prompt_user_part = PROMPT_USER_PART.format(part=part, transcript=transcript)
        logger.info("Summarizing part: %s", part)
        parts_summarized.append(
            LLM_call(
                client_summary, prompt_system_part, prompt_user_part.format(part=part)
            )
        )

    logger.info("Parts summarized")

    raw_summary = "\n\n".join(parts_summarized)

    prompt_system_next_steps = PROMPT_SYSTEM_NEXT_STEP
    prompt_system_cleaning = PROMPT_SYSTEM_CLEANING

    next_steps = LLM_call(client_summary, prompt_system_next_steps, transcript)
    logger.info("Next steps generated")
    cleaned_summary = LLM_call(client_summary, prompt_system_cleaning, raw_summary)
    logger.info("Summary cleaned")
    summary = out + "\n\n" + cleaned_summary + "\n\n" + next_steps

    data = {
        "title": title + " - Summary",
        "content": summary,
        "email": email,
        "sub": sub,
    }

    logger.debug("Submitting webhook to %s", settings.webhook_url)

    response = post_with_retries(settings.webhook_url, data)

    logger.info("Webhook submitted successfully. Status: %s", response.status_code)
    logger.debug("Response body: %s", response.text)
