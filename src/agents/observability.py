"""Sentry helpers for the LiveKit agents."""

import logging
import os
import tomllib
from os import path

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

logger = logging.getLogger("observability")

BASE_DIR = path.dirname(path.abspath(__file__))


def get_release():
    """Get the current release of the application.

    By release, we mean the ``version`` declared in ``pyproject.toml``.
    If the file cannot be read or declares no version, it defaults to "NA".
    """
    try:
        with open(path.join(BASE_DIR, "pyproject.toml"), "rb") as pyproject:
            return tomllib.load(pyproject)["project"]["version"]
    except (FileNotFoundError, KeyError, tomllib.TOMLDecodeError):
        return "NA"  # Default: not available


def configure_sentry(agent_name: str) -> None:
    """Initialize Sentry for the current agent process.

    No-op if ``SENTRY_DSN`` is not configured. Otherwise (re)initializes Sentry
    unconditionally so the calling process gets its own live transport.

    Must be called once per process: in the worker entrypoint and again in the
    per-job ``prewarm``/``setup_fnc`` hook, because LiveKit runs each job in a
    forked process. A forked child inherits the parent's initialized Sentry
    client but not its background transport thread (threads do not survive
    ``fork()``), so it must re-init to get a working transport. For that reason,
    do NOT guard this with ``sentry_sdk.is_initialized()``: the child inherits it
    as ``True`` and would skip init, silently dropping every event.

    Args:
        agent_name: Identifier of the agent, attached as a tag to Sentry issues
    """
    # Read the DSN at call time so it picks up variables that load_dotenv()
    # populated after this module was first imported.
    sentry_dsn = os.getenv("SENTRY_DSN")
    if not sentry_dsn:
        logger.debug("SENTRY_DSN not defined for agent '%s'", agent_name)
        return

    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT"),
        release=get_release(),
        debug=False,
        integrations=[
            # Capture log records emitted at ERROR and above as Sentry events.
            # This covers the agents' explicit logger.exception(...) calls as
            # well as asyncio's "Exception in callback" / "Task exception was
            # never retrieved" records, so unhandled task failures surface too.
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
    )
    sentry_sdk.set_tag("application", "agents")
    sentry_sdk.set_tag("agent", agent_name)

    logger.info("Sentry initialized for agent '%s' (pid %d)", agent_name, os.getpid())


def set_job_context(*, room: str | None = None, job_id: str | None = None) -> None:
    """Tag the current Sentry scope with the LiveKit job being handled.

    Args:
        room: Name of the room the job is serving.
        job_id: LiveKit job identifier.
    """
    scope = sentry_sdk.get_current_scope()
    if room is not None:
        scope.set_tag("room", room)
    if job_id is not None:
        scope.set_tag("job_id", job_id)
