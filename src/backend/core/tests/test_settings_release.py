"""Unit tests for the get_release settings helper."""

import re

import pytest

from meet.settings import get_release


@pytest.fixture(name="base_dir")
def fixture_empty_base_dir(tmp_path, monkeypatch):
    """Point get_release at an empty directory."""
    monkeypatch.setattr("meet.settings.BASE_DIR", str(tmp_path))
    return tmp_path


def test_get_release_reads_project_pyproject():
    """Should return the semantic version of the backend's pyproject.toml."""
    assert re.fullmatch(r"\d+\.\d+\.\d+", get_release())


def test_get_release_reads_pyproject_version(base_dir):
    """Should return the version declared in the [project] table."""
    (base_dir / "pyproject.toml").write_text(
        '[project]\nname = "meet"\nversion = "1.2.3"\n', encoding="utf-8"
    )
    assert get_release() == "1.2.3"


@pytest.mark.usefixtures("base_dir")
def test_get_release_missing_pyproject():
    """Should fall back to "NA" without a pyproject.toml."""
    assert get_release() == "NA"


@pytest.mark.parametrize(
    "content",
    [
        '[project]\nname = "meet"\n',  # no version
        "[tool.uv]\npackage = true\n",  # no [project] table
        "[project\nversion = ",  # malformed TOML
    ],
)
def test_get_release_unreadable_version(base_dir, content):
    """Should fall back to "NA" without a readable version in pyproject.toml."""
    (base_dir / "pyproject.toml").write_text(content, encoding="utf-8")
    assert get_release() == "NA"
