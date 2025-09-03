"""
Test worker service factories.
"""

# pylint: disable=protected-access,redefined-outer-name,unused-argument

from dataclasses import FrozenInstanceError
from unittest.mock import Mock

from django.test import override_settings

import pytest

from core.recording.worker.factories import (
    WorkerService,
    WorkerServiceConfig,
    get_worker_service,
)


@pytest.fixture(autouse=True)
def clear_lru_cache():
    """Clear the lru_cache before and after each test"""
    WorkerServiceConfig.from_settings.cache_clear()
    yield
    WorkerServiceConfig.from_settings.cache_clear()


@pytest.fixture
def test_settings():
    """Fixture to provide test Django settings"""
    mocked_settings = {
        "RECORDING_OUTPUT_FOLDER": "/test/output",
        "LIVEKIT_CONFIGURATION": {"server": "test.example.com"},
        "AWS_S3_ENDPOINT_URL": "https://s3.test.com",
        "AWS_S3_ACCESS_KEY_ID": "test_key",
        "AWS_S3_SECRET_ACCESS_KEY": "test_secret",
        "AWS_S3_REGION_NAME": "test-region",
        "AWS_STORAGE_BUCKET_NAME": "test-bucket",
    }

    # Use override_settings to properly patch Django settings
    with override_settings(**mocked_settings):
        yield test_settings


@pytest.fixture
def default_config(test_settings):
    """Fixture to provide a WorkerServiceConfig instance"""
    return WorkerServiceConfig.from_settings()


# Tests
def test_config_initialization(default_config):
    """Test that WorkerServiceConfig is properly initialized from settings"""
    assert default_config.output_folder == "/test/output"
    assert default_config.server_configurations == {"server": "test.example.com"}
    assert default_config.bucket_args == {
        "endpoint": "https://s3.test.com",
        "access_key": "test_key",
        "secret": "test_secret",
        "region": "test-region",
        "bucket": "test-bucket",
        "force_path_style": True,
    }


def test_config_immutability(default_config):
    """Test that config instances are immutable after creation"""
    with pytest.raises(FrozenInstanceError):
        default_config.output_folder = "new/path"


@override_settings(
    RECORDING_OUTPUT_FOLDER="/test/output",
    LIVEKIT_CONFIGURATION={"server": "test.example.com"},
    AWS_S3_ENDPOINT_URL="https://s3.test.com",
    AWS_S3_ACCESS_KEY_ID="test_key",
    AWS_S3_SECRET_ACCESS_KEY="test_secret",
    AWS_S3_REGION_NAME="test-region",
    AWS_STORAGE_BUCKET_NAME="test-bucket",
)
def test_config_caching():
    """Test that from_settings method caches its result"""
    # Clear cache before testing caching behavior
    WorkerServiceConfig.from_settings.cache_clear()

    config1 = WorkerServiceConfig.from_settings()
    config2 = WorkerServiceConfig.from_settings()
    assert config1 is config2


class MockWorkerService(WorkerService):
    """Mock worker service for testing."""

    def __init__(self, config):
        self.config = config


@pytest.fixture
def mock_import_string(monkeypatch):
    """Fixture to mock import_string function."""
    mock = Mock(return_value=MockWorkerService)
    monkeypatch.setattr("core.recording.worker.factories.import_string", mock)
    return mock


def test_factory_valid_mode(mock_import_string, settings, default_config):
    """Test getting worker service with valid mode."""

    settings.RECORDING_WORKER_CLASSES = {
        "test_mode": "path.to.MockWorkerService",
        "another_mode": "path.to.AnotherWorkerService",
    }

    worker = get_worker_service("test_mode")

    mock_import_string.assert_called_once_with("path.to.MockWorkerService")
    assert isinstance(worker, MockWorkerService)
    assert worker.config == default_config


def test_factory_invalid_mode(settings, mock_import_string, default_config):
    """Test getting worker service with invalid mode raises ValueError."""

    settings.RECORDING_WORKER_CLASSES = {
        "test_mode": "path.to.MockWorkerService",
        "another_mode": "path.to.AnotherWorkerService",
    }

    worker = get_worker_service("test_mode")

    mock_import_string.assert_called_once_with("path.to.MockWorkerService")
    assert isinstance(worker, MockWorkerService)

    with pytest.raises(ValueError) as exc_info:
        get_worker_service("invalid_mode")
        mock_import_string.assert_not_called()

    assert "Recording mode 'invalid_mode' not found" in str(exc_info.value)
    assert "Available modes: ['test_mode', 'another_mode']" in str(exc_info.value)


def test_factory_import_error(mock_import_string, settings):
    """Test handling of import errors."""

    mock_import_string.side_effect = ImportError("Module not found")

    settings.RECORDING_WORKER_CLASSES = {
        "test_mode": "path.to.MockWorkerService",
        "another_mode": "path.to.AnotherWorkerService",
    }

    with pytest.raises(ImportError) as exc_info:
        get_worker_service("test_mode")

    assert "Module not found" in str(exc_info.value)


def test_factory_empty_registry(settings):
    """Test behavior when worker registry is empty."""

    settings.RECORDING_WORKER_CLASSES = {}

    with pytest.raises(ValueError) as exc_info:
        get_worker_service("any_mode")

    assert "Available modes: []" in str(exc_info.value)
