"""Regression tests for database settings."""

import os
import subprocess
import sys

import pytest


@pytest.mark.parametrize(
    "database_environment",
    [
        {"DATABASE_URL": "postgresql://meet:pass@postgres.example/meet"},
        {
            "DB_HOST": "postgres.example",
            "DB_NAME": "meet",
            "DB_USER": "meet",
            "DB_PASSWORD": "pass",
            "DB_PORT": "5432",
        },
    ],
)
def test_database_configuration_disables_server_side_cursors(database_environment):
    """Both database configuration paths remain safe for transaction pooling."""

    environment = {
        **os.environ,
        "DJANGO_CONFIGURATION": "Development",
        "DJANGO_SETTINGS_MODULE": "meet.settings",
        **database_environment,
    }
    if "DATABASE_URL" not in database_environment:
        environment.pop("DATABASE_URL", None)

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "from configurations import importer; "
                "importer.install(); "
                "from django.conf import settings; "
                "print(settings.DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'])"
            ),
        ],
        check=True,
        capture_output=True,
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        env=environment,
        text=True,
    )

    assert result.stdout.strip() == "True"
