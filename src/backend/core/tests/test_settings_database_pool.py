"""Unit tests for the opt-in psycopg connection pool settings."""

# pylint: disable=protected-access

from django.core.exceptions import ImproperlyConfigured

import pytest

from meet import settings


def make_configuration(**overrides):
    """Build a throwaway configuration with plain values and its own DATABASES."""
    attributes = {
        "DATABASES": {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "OPTIONS": {"sslmode": "require"},
            }
        },
        "DB_PSYCOPG_POOL_ENABLED": True,
        "DB_PSYCOPG_POOL_MIN_SIZE": 1,
        "DB_PSYCOPG_POOL_MAX_SIZE": 3,
        "DB_PSYCOPG_POOL_TIMEOUT": 30.0,
        "DB_PSYCOPG_POOL_MAX_IDLE": 600.0,
        **overrides,
    }
    return type("PoolConfiguration", (settings.Test,), attributes)


def test_database_pool_disabled_leaves_options_untouched():
    """Without the flag, no connection pool is configured."""
    configuration = make_configuration(DB_PSYCOPG_POOL_ENABLED=False)

    configuration._configure_database_pool()

    assert configuration.DATABASES["default"]["OPTIONS"] == {"sslmode": "require"}
    assert "CONN_HEALTH_CHECKS" not in configuration.DATABASES["default"]


def test_database_pool_enabled_merges_pool_options():
    """The pool and keepalive options are added next to the existing ones."""
    configuration = make_configuration()

    configuration._configure_database_pool()

    assert configuration.DATABASES["default"]["OPTIONS"] == {
        "sslmode": "require",
        "keepalives_idle": 60,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        "pool": {"min_size": 1, "max_size": 3, "timeout": 30.0, "max_idle": 600.0},
    }


def test_database_pool_enabled_keeps_explicit_keepalives():
    """Keepalive values already set, e.g. from DATABASE_URL, are not overridden."""
    configuration = make_configuration(
        DATABASES={
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "OPTIONS": {"keepalives_idle": "30", "keepalives": "0"},
            }
        }
    )

    configuration._configure_database_pool()

    options = configuration.DATABASES["default"]["OPTIONS"]
    assert options["keepalives_idle"] == "30"
    assert options["keepalives"] == "0"
    assert options["keepalives_interval"] == 10


@pytest.mark.parametrize("health_checks", [None, False])
def test_database_pool_enabled_forces_health_checks(health_checks):
    """Pooled connections are checked on checkout, even if DATABASE_URL said no."""
    database = {"ENGINE": "django.db.backends.postgresql"}
    if health_checks is not None:
        database["CONN_HEALTH_CHECKS"] = health_checks
    configuration = make_configuration(DATABASES={"default": database})

    configuration._configure_database_pool()

    assert configuration.DATABASES["default"]["CONN_HEALTH_CHECKS"] is True


def test_database_pool_enabled_without_options():
    """A database without OPTIONS, as built from DATABASE_URL, gets them created."""
    configuration = make_configuration(
        DATABASES={"default": {"ENGINE": "django.db.backends.postgresql_psycopg2"}}
    )

    configuration._configure_database_pool()

    assert configuration.DATABASES["default"]["OPTIONS"]["pool"]["max_size"] == 3


@pytest.mark.parametrize(
    "overrides,match",
    [
        (
            {"DATABASES": {"default": {"ENGINE": "django.db.backends.sqlite3"}}},
            "requires the django.db.backends.postgresql engine",
        ),
        (
            {
                "DATABASES": {
                    "default": {
                        "ENGINE": "django.db.backends.postgresql",
                        "CONN_MAX_AGE": 60,
                    }
                }
            },
            "cannot be combined with persistent connections",
        ),
        (
            {"DB_PSYCOPG_POOL_MIN_SIZE": 6},
            "MIN_SIZE cannot be greater than",
        ),
        ({"DB_PSYCOPG_POOL_TIMEOUT": 0.0}, "must be positive"),
        ({"DB_PSYCOPG_POOL_MAX_IDLE": -1.0}, "must be positive"),
    ],
)
def test_database_pool_invalid_configuration(overrides, match):
    """An invalid pool setup fails at boot."""
    configuration = make_configuration(**overrides)

    with pytest.raises(ImproperlyConfigured, match=match):
        configuration._configure_database_pool()
