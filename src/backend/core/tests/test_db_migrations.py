# pylint: disable=missing-module-docstring,invalid-name
import os

from django.apps import apps
from django.conf import settings
from django.db import connection

import pytest


@pytest.mark.django_db
def test_db_schema_has_core_tables_and_core_has_migration_files():
    """
    Protects against:
    - Fresh DB missing core tables
    - Broken docker-compose DB init
    - Running tests with migrations disabled
    """

    # Detect pytest --nomigrations properly
    migration_modules = getattr(settings, "MIGRATION_MODULES", None)

    # If pytest --nomigrations is active, MIGRATION_MODULES is not a dict
    if not isinstance(migration_modules, dict):
        pytest.fail(
            "Migrations appear disabled (pytest --nomigrations?). "
            "Tests must run against real migrations."
        )

    # If core explicitly set to None, migrations disabled
    if "core" in migration_modules and migration_modules["core"] is None:
        pytest.fail("Migrations disabled for core app. Remove --nomigrations.")

    # Ensure migration files exist on disk
    core_app = apps.get_app_config("core")
    migrations_dir = os.path.join(core_app.path, "migrations")

    assert os.path.isdir(migrations_dir), "Missing core/migrations directory"

    migration_files = [
        f
        for f in os.listdir(migrations_dir)
        if f.endswith(".py") and f != "__init__.py"
    ]

    assert migration_files, "No migration files found for core app"

    # Use actual model table names (NOT hardcoded strings)
    Room = apps.get_model("core", "Room")
    Recording = apps.get_model("core", "Recording")
    User = apps.get_model("core", "User")

    expected_tables = {
        Room._meta.db_table,
        Recording._meta.db_table,
        User._meta.db_table,
    }

    existing_tables = set(connection.introspection.table_names())

    missing = expected_tables - existing_tables

    assert not missing, f"Missing critical tables: {missing}"
