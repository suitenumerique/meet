export enum EncryptionPhase {
  UNENCRYPTED = 'unencrypted',
  ENCRYPTED = 'encrypted',
  PAUSED = 'paused',
}

export type PauseReason =
  | 'recording'
  | 'transcript'
  | 'manual'
  | 'sip_participant'

export interface EncryptionStatus {
  phase: EncryptionPhase
  pauseReason?: PauseReason
  /** True when the local participant initiated the current pause. */
  pausedByMe: boolean
}

export interface EncryptionStatusContextValue extends EncryptionStatus {
  /**
   * Pause encryption for this session and notify the rest of the room.
   * Returns true on success.
   */
  pauseEncryption: (reason: PauseReason) => Promise<boolean>
  /**
   * Resume encryption after a pause. Returns true on success. Only the
   * participant who initiated the pause (or anyone meeting the legitimacy
   * rules) can resume.
   */
  resumeEncryption: () => Promise<boolean>
}
