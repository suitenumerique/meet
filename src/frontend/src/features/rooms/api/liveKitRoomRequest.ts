export type LiveKitRoomFailure = 'missing' | 'deleted'

// ensure: create the room unless it exists. locate: trust the one known live
export type LiveKitRoomRequest =
  | { kind: 'ensure' }
  | { kind: 'locate' }
  | {
      kind: 'recover'
      failure: LiveKitRoomFailure
      failedRoomSid: string
    }

export type LiveKitRoomBody = {
  ensure_room: boolean
  failure?: LiveKitRoomFailure
  failed_room_sid?: string
}

export const toLiveKitRoomBody = (
  request: LiveKitRoomRequest
): LiveKitRoomBody => {
  switch (request.kind) {
    case 'ensure':
      return { ensure_room: true }
    case 'locate':
      return { ensure_room: false }
    case 'recover':
      return {
        ensure_room: false,
        failure: request.failure,
        failed_room_sid: request.failedRoomSid,
      }
  }
}
