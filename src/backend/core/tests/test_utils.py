"""
Test utils functions
"""

from unittest import mock

from core.utils import create_livekit_client


@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_ssl_enabled(
    mock_livekit_api, mock_get_running_loop, settings
):
    """Test LiveKitAPI client creation with SSL verification enabled."""
    mock_get_running_loop.return_value = mock.MagicMock()
    settings.LIVEKIT_VERIFY_SSL = True

    create_livekit_client()

    mock_livekit_api.assert_called_once_with(
        **settings.LIVEKIT_CONFIGURATION, session=None
    )


@mock.patch("core.utils.aiohttp.ClientSession")
@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_ssl_disabled(
    mock_livekit_api, mock_get_running_loop, mock_client_session, settings
):
    """Test LiveKitAPI client creation with SSL verification disabled."""
    mock_get_running_loop.return_value = mock.MagicMock()
    mock_session_instance = mock.MagicMock()
    mock_client_session.return_value = mock_session_instance
    settings.LIVEKIT_VERIFY_SSL = False

    create_livekit_client()

    mock_livekit_api.assert_called_once_with(
        **settings.LIVEKIT_CONFIGURATION, session=mock_session_instance
    )


@mock.patch("asyncio.get_running_loop")
@mock.patch("core.utils.LiveKitAPI")
def test_create_livekit_client_custom_configuration(
    mock_livekit_api, mock_get_running_loop
):
    """Test LiveKitAPI client creation with custom configuration."""
    mock_get_running_loop.return_value = mock.MagicMock()
    custom_configuration = {
        "api_key": "mock_key",
        "api_secret": "mock_secret",
        "url": "http://mock-url.com",
    }

    create_livekit_client(custom_configuration)

    mock_livekit_api.assert_called_once_with(**custom_configuration, session=None)
