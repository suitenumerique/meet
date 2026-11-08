/**
 * The LiveKit credentials of a room give the URL of the LiveKit cluster the
 * room is placed on, while the config endpoint gives the default cluster's URL
 * earlier on. With a single cluster, both are the same URL.
 */
export type ClusterConnection = {
  /** The default cluster's URL, once the config is known */
  configUrl?: string
  /** The URL of the cluster the room is placed on, from its credentials */
  joinUrl?: string
  /** The URLs whose warm-up is over */
  warmedUpUrls: ReadonlySet<string>
  /** Whether connect was already turned on */
  isConnectLatched: boolean
}

/**
 * Ensure stable WebSocket connection URL. This is critical for legacy browser
 * compatibility (Firefox <124, Chrome <125, Edge <125) where HTTPS URLs in
 * WebSocket() constructor may fail - the force_wss_protocol flag allows
 * explicit WSS protocol conversion
 */
export const toConnectionUrl = (url: string, forceWssProtocol: boolean) =>
  forceWssProtocol ? url.replace('https://', 'wss://') : url

/**
 * The URL to warm up before connecting: the default cluster's as soon as the
 * config is known, while the join request is in flight, then the URL of the
 * cluster the room is placed on. None once connect is on, as connecting then
 * waits for no warm-up.
 */
export const getUrlToWarmUp = ({
  configUrl,
  joinUrl,
  isConnectLatched,
}: Omit<ClusterConnection, 'warmedUpUrls'>) => {
  if (configUrl === undefined || isConnectLatched) return undefined
  return joinUrl ?? configUrl
}

/**
 * Whether LiveKitRoom may connect: once the URL of the cluster the room is
 * placed on is warmed up, and from then on for good, since turning connect off
 * disconnects the room and stops the local tracks.
 */
export const shouldConnect = ({
  joinUrl,
  warmedUpUrls,
  isConnectLatched,
}: Omit<ClusterConnection, 'configUrl'>) =>
  isConnectLatched || (joinUrl !== undefined && warmedUpUrls.has(joinUrl))
