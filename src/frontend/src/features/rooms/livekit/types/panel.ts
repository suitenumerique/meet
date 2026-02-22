/**
 * Panel identifiers for the side panel (Info, Chat, Participants, etc.).
 * Extracted to avoid circular dependencies between layout store and useSidePanel.
 */
export enum PanelId {
  PARTICIPANTS = 'participants',
  EFFECTS = 'effects',
  CHAT = 'chat',
  TOOLS = 'tools',
  ADMIN = 'admin',
  INFO = 'info',
}

export enum SubPanelId {
  TRANSCRIPT = 'transcript',
  SCREEN_RECORDING = 'screenRecording',
}
