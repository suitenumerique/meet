"""
Test telephony service.
"""

# pylint: disable=W0212

from unittest import mock

import pytest
from asgiref.sync import async_to_sync
from livekit.api import TwirpError
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    DeleteSIPDispatchRuleRequest,
    ListSIPDispatchRuleRequest,
    ListSIPDispatchRuleResponse,
    SIPDispatchRule,
    SIPDispatchRuleInfo,
)

from core.factories import RoomFactory
from core.models import RoomAccessLevel
from core.services.telephony import TelephonyException, TelephonyService

pytestmark = pytest.mark.django_db


def create_mock_livekit_client():
    """Factory for creating LiveKit client mock."""
    mock_api = mock.Mock()
    mock_api.sip = mock.Mock()
    mock_api.aclose = mock.AsyncMock()
    return mock_api


def test_rule_name():
    """Test rule name generation."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")
    rule_name = telephony_service._rule_name(room.id)

    assert rule_name == f"SIP_{str(room.id)}"


@mock.patch("core.utils.create_livekit_client")
def test_create_dispatch_rule_success(mock_client_factory):
    """Test successful dispatch rule creation."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_api = create_mock_livekit_client()
    mock_api.sip.create_sip_dispatch_rule = mock.AsyncMock()
    mock_client_factory.return_value = mock_api

    telephony_service.create_dispatch_rule(room)

    mock_api.sip.create_sip_dispatch_rule.assert_called_once()
    create_request = mock_api.sip.create_sip_dispatch_rule.call_args[1]["create"]

    assert isinstance(create_request, CreateSIPDispatchRuleRequest)
    assert create_request.name == f"SIP_{str(room.id)}"
    assert create_request.rule.dispatch_rule_direct.room_name == str(room.id)
    assert create_request.rule.dispatch_rule_direct.pin == str(room.pin_code)
    mock_api.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_create_dispatch_rule_api_failure(mock_client_factory):
    """Test dispatch rule creation when API fails."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_api = create_mock_livekit_client()
    mock_api.sip.create_sip_dispatch_rule = mock.AsyncMock(
        side_effect=TwirpError(msg="Internal server error", code=500, status=500)
    )
    mock_client_factory.return_value = mock_api

    with pytest.raises(TelephonyException, match="Could not create dispatch rule"):
        telephony_service.create_dispatch_rule(room)

    mock_api.sip.create_sip_dispatch_rule.assert_called_once()
    mock_api.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_list_dispatch_rules_ids_success(mock_client_factory):
    """Test successful listing of dispatch rule IDs."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_rules = [
        SIPDispatchRuleInfo(
            sip_dispatch_rule_id="rule-1",
            name=f"SIP_{str(room.id)}",
            rule=SIPDispatchRule(),
        ),
        SIPDispatchRuleInfo(
            sip_dispatch_rule_id="rule-2", name="OTHER_RULE", rule=SIPDispatchRule()
        ),
        SIPDispatchRuleInfo(
            sip_dispatch_rule_id="rule-3",
            name=f"SIP_{str(room.id)}",
            rule=SIPDispatchRule(),
        ),
    ]

    mock_api = create_mock_livekit_client()
    mock_api.sip.list_sip_dispatch_rule = mock.AsyncMock(
        return_value=ListSIPDispatchRuleResponse(items=mock_rules)
    )
    mock_client_factory.return_value = mock_api

    result = async_to_sync(telephony_service._list_dispatch_rules_ids)(room.id)

    assert len(result) == 2
    assert "rule-1" in result
    assert "rule-3" in result
    assert "rule-2" not in result

    mock_api.sip.list_sip_dispatch_rule.assert_called_once()
    list_request = mock_api.sip.list_sip_dispatch_rule.call_args[1]["list"]
    assert isinstance(list_request, ListSIPDispatchRuleRequest)
    mock_api.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_list_dispatch_rules_ids_empty_response(mock_client_factory):
    """Test listing dispatch rule IDs when no rules exist."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_api = create_mock_livekit_client()
    mock_api.sip.list_sip_dispatch_rule = mock.AsyncMock(
        return_value=ListSIPDispatchRuleResponse(items=[])
    )
    mock_client_factory.return_value = mock_api

    result = async_to_sync(telephony_service._list_dispatch_rules_ids)(room.id)

    assert result == []
    mock_api.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_list_dispatch_rules_ids_no_matching_rules(mock_client_factory):
    """Test listing dispatch rule IDs when no rules match the room."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_rules = [
        SIPDispatchRuleInfo(
            sip_dispatch_rule_id="rule-1", name="OTHER_RULE_1", rule=SIPDispatchRule()
        ),
        SIPDispatchRuleInfo(
            sip_dispatch_rule_id="rule-2", name="OTHER_RULE_2", rule=SIPDispatchRule()
        ),
    ]

    mock_api = create_mock_livekit_client()
    mock_api.sip.list_sip_dispatch_rule = mock.AsyncMock(
        return_value=ListSIPDispatchRuleResponse(items=mock_rules)
    )
    mock_client_factory.return_value = mock_api

    result = async_to_sync(telephony_service._list_dispatch_rules_ids)(room.id)

    assert result == []
    mock_api.aclose.assert_called_once()


@mock.patch("core.utils.create_livekit_client")
def test_list_dispatch_rules_ids_api_failure(mock_client_factory):
    """Test listing dispatch rule IDs when API fails."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_api = create_mock_livekit_client()
    mock_api.sip.list_sip_dispatch_rule = mock.AsyncMock(
        side_effect=TwirpError(msg="Internal server error", code=500, status=500)
    )
    mock_client_factory.return_value = mock_api

    with pytest.raises(TelephonyException, match="Could not list dispatch rules"):
        async_to_sync(telephony_service._list_dispatch_rules_ids)(room.id)

    mock_api.sip.list_sip_dispatch_rule.assert_called_once()
    mock_api.aclose.assert_called_once()


@mock.patch("core.services.telephony.TelephonyService._list_dispatch_rules_ids")
@mock.patch("core.utils.create_livekit_client")
def test_delete_dispatch_rule_no_rules(mock_client_factory, mock_list_rules):
    """Test deleting dispatch rules when no rules exist."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_list_rules.return_value = []

    result = telephony_service.delete_dispatch_rule(room.id)

    assert result is False
    mock_list_rules.assert_called_once_with(room.id)
    mock_client_factory.assert_not_called()


@mock.patch("core.services.telephony.TelephonyService._list_dispatch_rules_ids")
@mock.patch("core.utils.create_livekit_client")
def test_delete_dispatch_rule_single_rule(mock_client_factory, mock_list_rules):
    """Test deleting a single dispatch rule."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_list_rules.return_value = ["rule-1"]
    mock_api = create_mock_livekit_client()
    mock_api.sip.delete_sip_dispatch_rule = mock.AsyncMock()
    mock_client_factory.return_value = mock_api

    result = telephony_service.delete_dispatch_rule(room.id)

    assert result is True
    mock_api.sip.delete_sip_dispatch_rule.assert_called_once()
    delete_request = mock_api.sip.delete_sip_dispatch_rule.call_args[1]["delete"]
    assert isinstance(delete_request, DeleteSIPDispatchRuleRequest)
    assert delete_request.sip_dispatch_rule_id == "rule-1"
    mock_api.aclose.assert_called_once()


@mock.patch("core.services.telephony.TelephonyService._list_dispatch_rules_ids")
@mock.patch("core.utils.create_livekit_client")
def test_delete_dispatch_rule_multiple_rules(mock_client_factory, mock_list_rules):
    """Test deleting multiple dispatch rules."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_list_rules.return_value = ["rule-1", "rule-2", "rule-3"]
    mock_api = create_mock_livekit_client()
    mock_api.sip.delete_sip_dispatch_rule = mock.AsyncMock()
    mock_client_factory.return_value = mock_api

    result = telephony_service.delete_dispatch_rule(room.id)

    assert result is True
    assert mock_api.sip.delete_sip_dispatch_rule.call_count == 3

    deleted_rule_ids = [
        call_args[1]["delete"].sip_dispatch_rule_id
        for call_args in mock_api.sip.delete_sip_dispatch_rule.call_args_list
    ]
    assert all(
        rule_id in deleted_rule_ids for rule_id in ["rule-1", "rule-2", "rule-3"]
    )
    mock_api.aclose.assert_called_once()


@mock.patch("core.services.telephony.TelephonyService._list_dispatch_rules_ids")
@mock.patch("core.utils.create_livekit_client")
def test_delete_dispatch_rule_partial_failure(mock_client_factory, mock_list_rules):
    """Test deleting multiple dispatch rules when one deletion fails."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_list_rules.return_value = ["rule-1", "rule-2", "rule-3"]
    mock_api = create_mock_livekit_client()

    call_count = 0

    def delete_side_effect(*args, **kwargs):
        nonlocal call_count
        if call_count == 0:
            call_count += 1
            return None
        raise TwirpError(msg="Deletion failed", code=500, status=500)

    mock_api.sip.delete_sip_dispatch_rule = mock.AsyncMock(
        side_effect=delete_side_effect
    )
    mock_client_factory.return_value = mock_api

    with pytest.raises(TelephonyException, match="Could not delete dispatch rules"):
        telephony_service.delete_dispatch_rule(room.id)

    assert mock_api.sip.delete_sip_dispatch_rule.call_count == 2
    mock_api.aclose.assert_called_once()


@mock.patch("core.services.telephony.TelephonyService._list_dispatch_rules_ids")
@mock.patch("core.utils.create_livekit_client")
def test_delete_dispatch_rule_api_failure(mock_client_factory, mock_list_rules):
    """Test deleting dispatch rules when API fails immediately."""
    telephony_service = TelephonyService()
    room = RoomFactory(access_level=RoomAccessLevel.RESTRICTED, pin_code="1234")

    mock_list_rules.return_value = ["rule-1"]
    mock_api = create_mock_livekit_client()
    mock_api.sip.delete_sip_dispatch_rule = mock.AsyncMock(
        side_effect=TwirpError(msg="Internal server error", code=500, status=500)
    )
    mock_client_factory.return_value = mock_api

    with pytest.raises(TelephonyException, match="Could not delete dispatch rules"):
        telephony_service.delete_dispatch_rule(room.id)

    mock_api.sip.delete_sip_dispatch_rule.assert_called_once()
    mock_api.aclose.assert_called_once()
