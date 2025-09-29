# Signaling

Signaling is essential for LiveKit’s real-time communication. It enables peers to discover each other, exchange session descriptions, and negotiate network paths for audio and video streams.

## How Signaling Works

LiveKit signaling relies on a WebSocket connection between the client and the LiveKit API server. This WebSocket is required for all signaling messages, including session descriptions, ICE candidates, and connection state updates.

We do not cover internal signaling behavior. For full reference, see the [LiveKit client protocol](https://docs.livekit.io/reference/internals/client-protocol/).

> [!IMPORTANT]
> The WebSocket is the backbone of LiveKit signaling. All signaling messages rely on it, and without it, ICE candidate exchange and peer connection setup cannot occur. If the WebSocket connection is lost, the client automatically attempts to resume the RTC session once connectivity is restored.



## Environment Variables

| Variable                                  | Type    | Default | Purpose                                                                                                                                                   |
| ----------------------------------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVEKIT_FORCE_WSS_PROTOCOL`              | Boolean | `True`  | Forces the WebSocket URL to use `wss://`. Required for legacy browsers (Firefox <124, Chrome <125, Edge <125) where HTTPS URLs in `WebSocket()` may fail. |
| `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND` | Boolean | `True`  | Workaround for Firefox clients behind proxies that fail to establish WebSocket connections. Pre-establishes a dummy connection to “prime” the WebSocket.  |

> [!NOTE]
> Questions? Open an issue on [GitHub](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) or join our [Matrix community](https://matrix.to/#/#meet-official:matrix.org).
