# Signaling

Signaling is essential for LiveKit’s real-time communication. It enables peers to discover each other, exchange session descriptions, and negotiate network paths for audio and video streams.

## How Signaling Works

LiveKit signaling relies on a WebSocket connection between the client and the LiveKit API server. This WebSocket is required for all signaling messages, including session descriptions, ICE candidates, and connection state updates.

We do not cover internal signaling behavior. For full reference, see the [LiveKit client protocol](https://docs.livekit.io/reference/internals/client-protocol/).

> [!IMPORTANT]
> The WebSocket is the backbone of LiveKit signaling. All signaling messages rely on it, and without it, ICE candidate exchange and peer connection setup cannot occur. If the WebSocket connection is lost, the client automatically attempts to resume the RTC session once connectivity is restored.

## Reconnection

When the WebSocket drops, for instance after a LiveKit node crash or during a Redis outage, every client in every room loses it at the same time. To keep them from all reconnecting at once, each client waits a random delay before every attempt. The first delay is at most `LIVEKIT_RECONNECT_BASE_DELAY_MS`. That ceiling then doubles after each failed attempt, capped at `LIVEKIT_RECONNECT_MAX_DELAY_MS`, and each later delay falls between half the ceiling and the ceiling. The first attempt always starts within 5 seconds of the drop.

A client gives up once its reconnection has lasted longer than `LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS`, and then shows a "connection lost" page. While only signaling is down and its media still flows, it keeps trying instead. A client that loses the connection again less than `LIVEKIT_RECONNECT_BACKOFF_RESET_MS` after reconnecting resumes the backoff one step above where it stopped.

## Environment Variables

| Variable                                  | Type    | Default  | Purpose                                                                                                                                                   |
| ----------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIVEKIT_FORCE_WSS_PROTOCOL`              | Boolean | `False`  | Forces the WebSocket URL to use `wss://`. Required for legacy browsers (Firefox <124, Chrome <125, Edge <125) where HTTPS URLs in `WebSocket()` may fail. |
| `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND` | Boolean | `False`  | Workaround for Firefox clients behind proxies that fail to establish WebSocket connections. Pre-establishes a dummy connection to “prime” the WebSocket.  |
| `LIVEKIT_RECONNECT_BACKOFF_ENABLED`       | Boolean | `True`   | Enables the reconnection backoff described above. When `False`, clients use LiveKit's default reconnection policy.                                        |
| `LIVEKIT_RECONNECT_BASE_DELAY_MS`         | Integer | `1000`   | Longest wait before the first reconnection attempt, in milliseconds. It doubles after each failed attempt. Must be greater than 0.                        |
| `LIVEKIT_RECONNECT_MAX_DELAY_MS`          | Integer | `10000`  | Longest wait between two reconnection attempts, in milliseconds. Must be greater than 0.                                                                  |
| `LIVEKIT_RECONNECT_GIVE_UP_AFTER_MS`      | Integer | `300000` | How long a client keeps trying to reconnect, in milliseconds. Not applied while its media still flows. Must be greater than 0.                            |
| `LIVEKIT_RECONNECT_BACKOFF_RESET_MS`      | Integer | `120000` | How long a connection must stay up, in milliseconds, for the next reconnection to start from the shortest delay again. With `0`, every reconnection does. |

> [!NOTE]
> Questions? Open an issue on [GitHub](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) or join our [Matrix community](https://matrix.to/#/#meet-official:matrix.org).
