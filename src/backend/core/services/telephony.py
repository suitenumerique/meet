"""Telephony service for managing SIP dispatch rules for room access."""

from logging import getLogger

from asgiref.sync import async_to_sync
from livekit.api import TwirpError
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    DeleteSIPDispatchRuleRequest,
    ListSIPDispatchRuleRequest,
    SIPDispatchRule,
    SIPDispatchRuleDirect,
)

from core import utils

logger = getLogger(__name__)


class TelephonyException(Exception):
    """Exception raised when telephony operations fail."""


class TelephonyService:
    """Service for managing participant access through the telephony system (SIP)."""

    def _rule_name(self, room_id):
        """Generate the rule name for a room based on its ID."""
        return f"SIP_{str(room_id)}"

    @async_to_sync
    async def create_dispatch_rule(self, room):
        """Create a SIP inbound dispatch rule for direct room routing.

        Configures telephony to route incoming SIP calls directly to the specified room
        using the room's ID and PIN code for authentication.
        """

        direct_rule = SIPDispatchRule(
            dispatch_rule_direct=SIPDispatchRuleDirect(
                room_name=str(room.pk), pin=str(room.pin_code)
            )
        )

        request = CreateSIPDispatchRuleRequest(
            rule=direct_rule, name=self._rule_name(room.pk)
        )

        lkapi = utils.create_livekit_client()

        try:
            await lkapi.sip.create_sip_dispatch_rule(create=request)
        except TwirpError as e:
            logger.exception(
                "Unexpected error creating dispatch rule for room %s", room.id
            )
            raise TelephonyException("Could not create dispatch rule") from e

        finally:
            await lkapi.aclose()

    async def _list_dispatch_rules_ids(self, room_id):
        """List SIP dispatch rule IDs for a specific room.

        Fetches all existing SIP dispatch rules and filters them by room name
        since LiveKit API doesn't support server-side filtering by 'room_name'.
        This approach is acceptable for moderate scale but may need refactoring
        for high-volume scenarios.

        Note:
            Feature request for server-side filtering: livekit/sip#405
        """

        lkapi = utils.create_livekit_client()

        try:
            existing_rules = await lkapi.sip.list_sip_dispatch_rule(
                list=ListSIPDispatchRuleRequest()
            )
        except TwirpError as e:
            logger.exception("Failed to list dispatch rules for room %s", room_id)
            raise TelephonyException("Could not list dispatch rules") from e
        finally:
            await lkapi.aclose()

        if not existing_rules or not existing_rules.items:
            return []

        rule_name = self._rule_name(room_id)

        return [
            existing_rule.sip_dispatch_rule_id
            for existing_rule in existing_rules.items
            if existing_rule.name == rule_name
        ]

    @async_to_sync
    async def delete_dispatch_rule(self, room_id):
        """Delete all SIP inbound dispatch rules associated with a specific room."""

        rules_ids = await self._list_dispatch_rules_ids(room_id)

        if not rules_ids:
            logger.info("No dispatch rules found for room %s", room_id)
            return False

        if len(rules_ids) > 1:
            logger.error("Multiple dispatch rules found for room %s", room_id)

        lkapi = utils.create_livekit_client()
        try:
            for rule_id in rules_ids:
                await lkapi.sip.delete_sip_dispatch_rule(
                    delete=DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=rule_id)
                )

            return True

        except TwirpError as e:
            logger.exception("Failed to delete dispatch rules for room %s", room_id)
            raise TelephonyException("Could not delete dispatch rules") from e

        finally:
            await lkapi.aclose()
