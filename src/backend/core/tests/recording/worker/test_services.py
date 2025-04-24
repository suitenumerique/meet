"""
Test worker service classes.
"""

# pylint: disable=W0212,W0621,W0613,E1101

from unittest.mock import AsyncMock, Mock, patch

import aiohttp
import pytest

from core.recording.worker.exceptions import WorkerConnectionError, WorkerResponseError
from core.recording.worker.factories import WorkerServiceConfig
from core.recording.worker.services import (
    AudioCompositeEgressService,
    BaseEgressService,
    VideoCompositeEgressService,
    livekit_api,
)


@pytest.fixture
def config():
    """Fixture to provide a WorkerServiceConfig instance"""
    return WorkerServiceConfig(
        output_folder="/test/output",
        server_configurations={
            "url": "test.livekit.io",
            "api_key": "test_key",
            "api_secret": "test_secret",
        },
        verify_ssl=True,
        bucket_args={
            "endpoint": "https://s3.test.com",
            "access_key": "test_key",
            "secret": "test_secret",
            "region": "test-region",
            "bucket": "test-bucket",
            "force_path_style": True,
        },
    )


@pytest.fixture
def mock_s3_upload():
    """Fixture for mocked S3Upload"""
    with patch("core.recording.worker.services.livekit_api.S3Upload") as mock:
        yield mock


@pytest.fixture
def mock_egress_service():
    """Fixture for mocked EgressService"""
    with patch("core.recording.worker.services.EgressService") as mock:
        yield mock


@pytest.fixture
def service(config, mock_s3_upload):
    """Fixture for BaseEgressService instance"""
    return BaseEgressService(config)


@pytest.fixture
def mock_client_session():
    """Fixture for mocked aiohttp.ClientSession"""
    with patch("aiohttp.ClientSession") as mock:
        mock.return_value.__aenter__ = AsyncMock()
        mock.return_value.__aexit__ = AsyncMock()
        yield mock


@pytest.fixture
def mock_tcp_connector():
    """Fixture for TCPConnector"""
    with patch("aiohttp.TCPConnector") as mock_connector:
        mock_connector_instance = Mock()
        mock_connector.return_value = mock_connector_instance
        yield mock_connector


@pytest.fixture
def video_service(config):
    """Fixture for VideoCompositeEgressService"""
    service = VideoCompositeEgressService(config)
    service._handle_request = Mock()  # Mock the request handler
    return service


@pytest.fixture
def audio_service(config):
    """Fixture for AudioCompositeEgressService"""
    service = AudioCompositeEgressService(config)
    service._handle_request = Mock()  # Mock the request handler
    return service


def test_base_egress_initialization(config, mock_s3_upload):
    """Test service initialization"""

    service = BaseEgressService(config)
    assert service._config == config

    mock_s3_upload.assert_called_once_with(
        endpoint="https://s3.test.com",
        access_key="test_key",
        secret="test_secret",
        region="test-region",
        bucket="test-bucket",
        force_path_style=True,
    )


@pytest.mark.parametrize(
    "filename,extension,expected",
    [
        ("test", "mp4", "/test/output/test.mp4"),
        ("recording123", "ogg", "/test/output/recording123.ogg"),
        ("live_stream", "m3u8", "/test/output/live_stream.m3u8"),
    ],
)
def test_base_egress_filepath_construction(service, filename, extension, expected):
    """Test filepath construction with various inputs"""
    result = service._get_filepath(filename, extension)
    assert result == expected
    assert result.startswith(service._config.output_folder)
    assert result.endswith(f"{filename}.{extension}")


def test_base_egress_handle_request_success(
    config, service, mock_client_session, mock_egress_service, mock_tcp_connector
):
    """Test successful request handling"""
    # Setup mock response
    mock_response = Mock()
    mock_method = AsyncMock(return_value=mock_response)
    mock_egress_instance = Mock()
    mock_egress_instance.test_method = mock_method
    mock_egress_service.return_value = mock_egress_instance

    # Create test request
    test_request = Mock()

    response = service._handle_request(test_request, "test_method")

    mock_client_session.assert_called_once_with(
        connector=mock_tcp_connector.return_value
    )

    # Verify EgressService initialization
    mock_egress_service.assert_called_once_with(
        mock_client_session.return_value.__aenter__.return_value,
        **service._config.server_configurations,
    )

    # Verify method call and response
    mock_method.assert_called_once_with(test_request)
    assert response == mock_response


def test_base_egress_handle_request_connection_error(service, mock_egress_service):
    """Test handling of connection errors"""
    # Setup mock error
    mock_method = AsyncMock(
        side_effect=livekit_api.TwirpError(msg="Connection failed", code=500)
    )
    mock_egress_instance = Mock()
    mock_egress_instance.test_method = mock_method
    mock_egress_service.return_value = mock_egress_instance

    # Create test request
    test_request = Mock()

    # Verify error handling
    with pytest.raises(WorkerConnectionError) as exc:
        service._handle_request(test_request, "test_method")

    assert "LiveKit client connection error" in str(exc.value)
    assert "Connection failed" in str(exc.value)


@pytest.mark.parametrize(
    "response_status,expected_result",
    [
        (livekit_api.EgressStatus.EGRESS_ABORTED, "ABORTED"),
        (livekit_api.EgressStatus.EGRESS_COMPLETE, "FAILED_TO_STOP"),
        (livekit_api.EgressStatus.EGRESS_ENDING, "STOPPED"),
        (livekit_api.EgressStatus.EGRESS_FAILED, "FAILED_TO_STOP"),
    ],
)
def test_base_egress_stop_with_status(service, response_status, expected_result):
    """Test stop method with different response statuses"""
    # Mock _handle_request
    mock_response = Mock(status=response_status)
    service._handle_request = Mock(return_value=mock_response)

    # Execute stop
    result = service.stop("test_worker_id")

    # Verify request and response handling
    service._handle_request.assert_called_once_with(
        livekit_api.StopEgressRequest(egress_id="test_worker_id"), "stop_egress"
    )
    assert result == expected_result


def test_base_egress_stop_missing_status(service):
    """Test stop method when response is missing status"""
    # Mock _handle_request with missing status
    mock_response = Mock(status=None)
    service._handle_request = Mock(return_value=mock_response)

    # Verify error handling
    with pytest.raises(WorkerResponseError) as exc:
        service.stop("test_worker_id")

    assert "missing the recording status" in str(exc.value)


def test_base_egress_start_not_implemented(service):
    """Test that start method raises NotImplementedError"""
    with pytest.raises(NotImplementedError) as exc:
        service.start("test_room", "test_recording")
    assert "Subclass must implement this method" in str(exc.value)


@pytest.mark.parametrize("verify_ssl", [True, False])
def test_base_egress_ssl_verification_config(verify_ssl):
    """Test SSL verification configuration"""
    config = WorkerServiceConfig(
        output_folder="/test/output",
        server_configurations={
            "url": "test.livekit.io",
            "api_key": "test_key",
            "api_secret": "test_secret",
        },
        verify_ssl=verify_ssl,
        bucket_args={
            "endpoint": "https://s3.test.com",
            "access_key": "test_key",
            "secret": "test_secret",
            "region": "test-region",
            "bucket": "test-bucket",
            "force_path_style": True,
        },
    )

    service = BaseEgressService(config)

    # Mock ClientSession to capture connector configuration
    with patch("aiohttp.ClientSession") as mock_session:
        mock_session.return_value.__aenter__ = AsyncMock()
        mock_session.return_value.__aexit__ = AsyncMock()

        # Trigger request to verify connector configuration
        service._handle_request(Mock(), "test_method")

        # Verify SSL configuration
        connector = mock_session.call_args[1]["connector"]
        assert isinstance(connector, aiohttp.TCPConnector)
        assert connector._ssl == verify_ssl


def test_video_composite_egress_hrid(video_service):
    """Test HRID is correct"""
    assert video_service.hrid == "video-recording-composite-livekit-egress"


def test_video_composite_egress_start_success(video_service):
    """Test successful start of video composite egress"""
    # Setup mock response
    egress_id = "test-egress-123"
    video_service._handle_request.return_value = Mock(egress_id=egress_id)

    # Test parameters
    room_name = "test-room"
    recording_id = "rec-123"

    # Call start
    result = video_service.start(room_name, recording_id)

    # Verify result
    assert result == egress_id

    # Verify request construction
    video_service._handle_request.assert_called_once()
    request = video_service._handle_request.call_args[0][0]
    method = video_service._handle_request.call_args[0][1]

    # Verify request properties
    assert isinstance(request, livekit_api.RoomCompositeEgressRequest)
    assert request.room_name == room_name
    assert len(request.file_outputs) == 1

    assert not request.audio_only  # Video service shouldn't set audio_only

    # Verify file output configuration
    file_output = request.file_outputs[0]
    assert file_output.file_type == livekit_api.EncodedFileType.MP4
    assert file_output.filepath == f"/test/output/{recording_id}.mp4"
    assert file_output.s3.bucket == "test-bucket"

    # Verify method name
    assert method == "start_room_composite_egress"


def test_video_composite_egress_start_missing_egress_id(video_service):
    """Test handling of missing egress ID in response"""
    # Setup mock response without egress_id
    video_service._handle_request.return_value = Mock(egress_id=None)

    with pytest.raises(WorkerResponseError) as exc_info:
        video_service.start("test-room", "rec-123")

    assert "Egress ID not found" in str(exc_info.value)


def test_audio_composite_egress_hrid(audio_service):
    """Test HRID is correct"""
    assert audio_service.hrid == "audio-recording-composite-livekit-egress"


def test_audio_composite_egress_start_success(audio_service):
    """Test successful start of audio composite egress"""
    # Setup mock response
    egress_id = "test-egress-123"
    audio_service._handle_request.return_value = Mock(egress_id=egress_id)

    # Test parameters
    room_name = "test-room"
    recording_id = "rec-123"

    # Call start
    result = audio_service.start(room_name, recording_id)

    # Verify result
    assert result == egress_id

    # Verify request construction
    audio_service._handle_request.assert_called_once()
    request = audio_service._handle_request.call_args[0][0]
    method = audio_service._handle_request.call_args[0][1]

    # Verify request properties
    assert isinstance(request, livekit_api.RoomCompositeEgressRequest)
    assert request.room_name == room_name
    assert len(request.file_outputs) == 1
    assert request.audio_only is True  # Audio service should set audio_only

    # Verify file output configuration
    file_output = request.file_outputs[0]
    assert file_output.file_type == livekit_api.EncodedFileType.OGG
    assert file_output.filepath == f"/test/output/{recording_id}.ogg"
    assert file_output.s3.bucket == "test-bucket"

    # Verify method name
    assert method == "start_room_composite_egress"


def test_audio_composite_egress_start_missing_egress_id(audio_service):
    """Test handling of missing egress ID in response"""
    # Setup mock response without egress_id
    audio_service._handle_request.return_value = Mock(egress_id=None)

    with pytest.raises(WorkerResponseError) as exc_info:
        audio_service.start("test-room", "rec-123")

    assert "Egress ID not found" in str(exc_info.value)
