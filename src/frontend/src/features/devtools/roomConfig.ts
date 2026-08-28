import { Room } from 'livekit-client'

export type ConfigEntry = {
  label: string
  value: string
  /** true = feature actively on, false = off, undefined = informational */
  on?: boolean
}

const formatBackupCodec = (backup: unknown): string => {
  if (backup === undefined || backup === true) return 'auto'
  if (backup === false) return 'off'
  if (typeof backup === 'object' && backup !== null && 'codec' in backup) {
    return String((backup as { codec: unknown }).codec)
  }
  return String(backup)
}

export const readRoomConfig = (room: Room): ConfigEntry[] => {
  const options = room.options
  const publish = options.publishDefaults
  const adaptive = options.adaptiveStream

  const entries: ConfigEntry[] = [
    {
      label: 'adaptiveStream',
      value:
        typeof adaptive === 'object'
          ? JSON.stringify(adaptive)
          : String(!!adaptive),
      on: !!adaptive,
    },
    {
      label: 'dynacast',
      value: String(!!options.dynacast),
      on: !!options.dynacast,
    },
    {
      label: 'e2ee',
      value: String(room.isE2EEEnabled),
      on: room.isE2EEEnabled,
    },
    {
      label: 'videoCodec',
      value: publish?.videoCodec ?? 'default',
    },
    {
      label: 'backupCodec',
      value: formatBackupCodec(publish?.backupCodec),
    },
    {
      label: 'simulcast',
      value: String(publish?.simulcast ?? true),
      on: publish?.simulcast ?? true,
    },
    {
      label: 'audio dtx',
      value: String(publish?.dtx ?? true),
      on: publish?.dtx ?? true,
    },
    {
      label: 'audio red',
      value: String(publish?.red ?? true),
      on: publish?.red ?? true,
    },
    {
      label: 'quality (local)',
      value: room.localParticipant.connectionQuality,
    },
  ]

  const server = room.serverInfo
  if (server) {
    entries.push({
      label: 'server',
      value: [
        server.version && `v${server.version}`,
        server.region,
        server.protocol !== undefined && `proto ${server.protocol}`,
        server.edition !== undefined && `edition ${server.edition}`,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  return entries
}
