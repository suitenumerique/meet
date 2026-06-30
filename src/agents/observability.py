"""Sentry helpers for the LiveKit agents."""

import logging
import os
import tomllib
from os import path

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

logger = logging.getLogger("observability")

BASE_DIR = path.dirname(path.abspath(__file__))

# PIDs in which Sentry has already been initialized. LiveKit runs each agent
# job in its own process. A forked child inherits the parent's initialized
# Sentry client but not its background thread (threads do not survive fork),
# so events would be queued and never sent. We therefore key the the current
# PID and re-initialize whenever we run in a new process, rather than relying on
# sentry_sdk.is_initialized() (which the child inherits as True).
_initialized_pids: set[int] = set()


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

    Safe to call multiple times and from forked job processes. No-op if
    SENTRY_DSN is not configured, or if Sentry was already initialized in
    the calling process.

    Must be called once per process (e.g. in the worker entrypoint and again in
    the per-job ``prewarm``/``setup_fnc`` hook) so each job process gets its own
    live transport rather than the dead one it would inherit through ``fork()``.

    Args:
        agent_name: Identifier of the agent, attached as a tag to Sentry issues
    """
    # Read the DSN at call time so it picks up variables that load_dotenv()
    # populated after this module was first imported.
    sentry_dsn = os.getenv("SENTRY_DSN")
    if not sentry_dsn:
        logger.warning("SENTRY_DSN not defined for agent '%s'", agent_name)
        return

    pid = os.getpid()
    if pid in _initialized_pids:
        logger.info(
            "Sentry already initialized for agent '%s' (pid %d)", agent_name, pid
        )
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
    _initialized_pids.add(pid)

    logger.info("Sentry initialized for agent '%s' (pid %d)", agent_name, pid)


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
