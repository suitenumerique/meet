/**
 * Resolves the `everyone_can_mute` room configuration like the backend does:
 * a missing setting means enabled, while a stored `null` or `false` means
 * disabled. The value comes from `RoomConfiguration`, whose `everyone_can_mute`
 * can be `null` when the room was configured through the API.
 */
export const getEveryoneCanMute = (everyoneCanMute?: boolean | null): boolean =>
  everyoneCanMute !== false && everyoneCanMute !== null
