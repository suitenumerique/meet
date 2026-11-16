# Multi-cluster LiveKit

La Suite Meet can spread its rooms over several independent LiveKit clusters. The Django backend chooses the cluster of each room: the first time it hands out LiveKit credentials for a room, it places the room's LiveKit room on one cluster, creates the LiveKit room there, and hands out a URL and a token for that cluster only. Everyone joining the room afterwards is sent to the same cluster, so its participants are never split between LiveKit rooms.

A deployment with a single LiveKit cluster runs the same code, see [With a single cluster](#with-a-single-cluster).

**Current Limitations**:

* Telephony (`ROOM_TELEPHONY_ENABLED`) and roomkit (`ROOMKIT_ENABLED`) need a single cluster: the backend refuses to start with either of them and more than one cluster in `LIVEKIT_CLUSTERS`. Phone and roomkit callers reach the SIP server of one cluster before their PIN tells which room they join, so the backend cannot send them to the cluster the room is placed on.
* Relocating a room is only possible from the Django shell, and disconnects its participants, who land on the page shown when a room is deleted and have to open the room again, see [Relocating a room](#relocating-a-room).
* Unregistered rooms (`ALLOW_UNREGISTERED_ROOMS`) all live on the default cluster: they are neither spread over the clusters nor relocated, and cannot be joined while the default cluster is down.
* A room placed on a cluster that is down cannot be joined until it is relocated: its placement only ends with the `room_finished` webhook of that cluster, so every join answers a `503` meanwhile, see [A cluster is down](#a-cluster-is-down).

> [!NOTE]
> Questions? Open an issue on [GitHub](https://github.com/suitenumerique/meet/issues/new?assignees=&labels=bug&template=Bug_report.md) or join our [Matrix community](https://matrix.to/#/#meet-official:matrix.org).

## Vocabulary

* **LiveKit cluster**: one LiveKit deployment, with its own URL, API key and secret. Its nodes share a Redis, but two clusters share nothing.
* **Registry**: the clusters the backend knows, listed in `LIVEKIT_CLUSTERS`. The first one is the **default cluster**.
* **Room**: a room of Meet. **LiveKit room**: the LiveKit room of a meeting, named after the id of its room, which lives on one cluster.
* **Placement**: the record, in the database, of the cluster a LiveKit room lives on. It lasts from the first credentials handed out for the LiveKit room until the LiveKit room finishes.
* **Candidate**: a registered cluster that may receive new placements, that is whose weight is above 0.
* **Placement strategy**: the rule picking the cluster of a new placement among the candidates.
* **Relocation**: moving the placement of a room to another cluster, and closing its LiveKit room on the cluster it leaves.

## How it works

### Joining a room

Each time the backend hands out LiveKit credentials for a room, through `POST /api/v1.0/rooms/{id}/join/`, or `request-entry/` when it lets the participant in, it:

1. reads the placement of the room's LiveKit room, or places it on the cluster the placement strategy picks among the candidates. A placement on a cluster that is no longer registered is deleted, and the LiveKit room placed again;
2. creates the LiveKit room on that cluster. A LiveKit room live there already is kept as it is. No metadata is sent, as the cluster would store it in place of a live LiveKit room's;
3. records the SID of the LiveKit room on the placement, as long as the placement did not change meanwhile, as when a relocation moved it: otherwise it reads the placement again and starts over, once;
4. hands out the URL browsers reach that cluster at, and a token signed with that cluster's API key.

```mermaid
sequenceDiagram
    participant Frontend
    participant Backend as Django Backend
    participant Database
    participant LiveKit as LiveKit cluster

    Frontend->>Backend: POST /api/v1.0/rooms/{id}/join/
    Backend->>Database: Read the placement of the LiveKit room
    opt Not placed yet
        Backend->>Backend: Pick a candidate (placement strategy)
        Backend->>Database: Create the placement
    end
    Backend->>LiveKit: CreateRoom
    alt LiveKit room created, or live there already
        LiveKit-->>Backend: SID of the LiveKit room
        Backend->>Database: Record the SID, unless the placement changed
        Backend-->>Frontend: livekit url and token of that cluster
        Frontend->>LiveKit: Connect
    else Cluster unreachable, too slow or failing
        Backend->>Database: Delete the placement this request created
        Backend-->>Frontend: 503
    end
```

The request is answered with a `503`, `{"detail": "This room cannot be joined for now, please try again."}`:

* when no cluster may receive the room, as when every cluster weighs 0. The backend also logs `No LiveKit cluster may receive new placements` as critical;
* when its cluster fails to create the LiveKit room: it cannot be reached, does not answer in time or answers with an error. A placement created by the request is deleted, as nobody was handed out credentials for it, so the next attempt may place the room on another cluster. An older placement stays, and the next attempt tries the same cluster again;
* when its placement keeps changing while the LiveKit room is created.

The roomkit join places the room and creates its LiveKit room the same way, as a meeting-room device may be its first participant.

An unregistered room is never placed, since the backend does not follow its lifecycle: `LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX` usually filters its webhooks out. Its LiveKit room is created on the default cluster, and its credentials are for that cluster.

The connection test (`CONNECTION_TEST_ENABLED`) creates its LiveKit room on the cluster the placement strategy picks, without placement, as nobody else ever joins it. It answers a `503` when that cluster fails to create it, as it tries no other, and with Celery its LiveKit room is deleted later on that same cluster.

### Placement strategies

`LIVEKIT_PLACEMENT_STRATEGY` names the strategy, by its dotted path:

| Strategy | Picks |
|---|---|
| `core.livekit.strategies.WeightedRandomStrategy` (default) | A candidate at random, with a probability proportional to its weight: with weights of 1 and 3, the second cluster receives three quarters of the new rooms |
| `core.livekit.strategies.RoundRobinStrategy` | The candidates in turn, whatever their weights. Turns are counted in the Django cache, which all backend processes share |
| `core.livekit.strategies.LeastPlacementsStrategy` | The candidate holding the fewest placements for its weight, the one registered first on a tie. Rooms placed at the same moment may all go to the same cluster |

A cluster weighing 0 is no candidate: it keeps its live rooms and receives no new placement.

A strategy is a subclass of `core.livekit.strategies.PlacementStrategy`, whose `choose(candidates, context)` returns one of the candidates. The context gives the name of the LiveKit room and its room, or `None` for a connection test.

### Managing a live room

Everything the backend does to a live LiveKit room is done on the cluster of its placement: updating its metadata when the room's configuration changes, managing its participants, dispatching the subtitle agent, and closing it when the room is deleted. A LiveKit room without placement, unregistered or live since before placements existed, is managed on the default cluster, and so is one placed on a cluster that is no longer registered, which is logged as a warning. With a single cluster, the database is not read.

Every cluster sends its webhooks to `/api/v1.0/rooms/webhooks-livekit/`, signed with its own API key. The backend tells which cluster sent a webhook by the API key that signed it, which is why every cluster needs an API key of its own. Requests authenticated with a LiveKit token (`X-LiveKit-Token`) are checked the same way.

When a LiveKit room finishes (`room_finished`), its placement is deleted, but only when the placement is on the cluster that sent the webhook and has the SID of the LiveKit room that finished. Otherwise the room has moved on to another LiveKit room since, created again or relocated, which participants may be joining: the room is then not cleaned up, so its SIP dispatch rule stays and participants admitted from its lobby are not queued again. A LiveKit room without placement is cleaned up as before.

### Recordings, subtitles and agents

A recording is made on the cluster its room is placed on when the recording starts, which the recording keeps in `livekit_cluster` (shown in the admin). Its egress is started, stopped and looked up there, its metadata collector dispatched there, and the room metadata it updates and its notifications sent there, wherever the room is placed since. A recording naming no cluster, as one made before this release, and one on a cluster that is no longer registered, which is logged as a warning, are managed on the default cluster.

So every cluster needs:

* its own [LiveKit Egress](recording.md), which must reach the bucket of Meet (`AWS_S3_ENDPOINT_URL`): the backend hands each egress the bucket and its credentials, and recordings are still written under `RECORDING_OUTPUT_FOLDER`;
* its own subtitle and metadata collector agents, registered under the names in `ROOM_SUBTITLE_AGENT_NAME` and `METADATA_COLLECTOR_AGENT_NAME`, since the backend dispatches them on the cluster of the room.

Relocating a room ends its recording with the LiveKit room it leaves: the recording is saved and transcribed as usual, and recording again means starting a new one.

### Relocating a room

A relocation moves a live room off its cluster, to rebalance rooms or to empty a cluster before its maintenance. It is done from the Django shell:

```python
from core.livekit.placements import PlacementService

PlacementService.relocate("<room id>", to="lyon", actor=None)  # to a given cluster
PlacementService.relocate("<room id>", actor=None)  # to the one the strategy picks
```

`actor` is who relocates the room in the audit log: a user, or `None` for the system. Relocating a room:

1. reads its placement and picks another candidate, the one named or else the one the placement strategy picks among the other candidates;
2. moves the placement to that cluster, as long as it did not change since it was read, and forgets its SID: the LiveKit room is created on the new cluster by the next join;
3. merges `{"relocation": {"id": "<relocation id>"}}` into the metadata of the LiveKit room on the cluster it leaves;
4. deletes the LiveKit room there, which disconnects its participants.

```mermaid
sequenceDiagram
    participant Operator
    participant Backend as Django Backend
    participant Database
    participant Source as Cluster left
    participant Target as Cluster chosen
    participant Frontend as Participants

    Operator->>Backend: PlacementService.relocate (Django shell)
    Backend->>Database: Move the placement to the chosen cluster
    Backend->>Source: Merge the relocation into the room metadata
    Backend->>Source: DeleteRoom
    Source-->>Frontend: Disconnected, room deleted
    Source-->>Backend: Webhook room_finished: not the placement's, no cleanup
    Frontend->>Backend: POST join/ (the participant opens the room again)
    Backend->>Target: CreateRoom
    Backend-->>Frontend: livekit url and token of the chosen cluster
    Frontend->>Target: Connect
```

A relocation raises `RelocationRefusedError`, having changed nothing, when the LiveKit room is not placed, or is placed on a cluster that is not registered, when the cluster named is the current one, is unknown or weighs 0, when there is no other candidate, and when the placement changed since it was read. A room is thus never moved twice by two relocations made at the same time.

The LiveKit room left is closed as best it can be: one that is not live there is left alone. When the cluster fails to announce the relocation, the LiveKit room is not deleted, as its participants would otherwise be sent away as if the meeting were over: they stay there, while those who join afterwards are sent to the new cluster. When it fails to delete the LiveKit room, the announcement stays. Either failure is logged and audited, and the relocation stands. A LiveKit room live on a cluster it is not placed on is closed the same way, its placement left as it is, with:

```python
from core.livekit.clusters import get_livekit_cluster

PlacementService.close_stray_room(get_livekit_cluster("paris"), "<room id>", actor=None)
```

The frontend of this release does not act on the relocation announced in the metadata yet: participants land on the page shown when a room is deleted, and get credentials for the new cluster when they open the room again.

#### A cluster is down

The rooms placed on a cluster that is down keep their placement, as only that cluster's `room_finished` webhook ends it, and every join of them answers a `503`, since the cluster cannot create their LiveKit room. Set the cluster's weight to 0, so that it receives no new room, and relocate its rooms: a relocation moves the placement without reaching the cluster left, logs and audits its failure to close the LiveKit room there, and the next join creates the LiveKit room on the new cluster. To list the rooms placed on a cluster:

```python
from core.models import Placement

Placement.objects.filter(cluster="paris").values_list("room_name", flat=True)
```

### In the browser

The frontend connects to the `livekit.url` handed out with its token, the URL of the cluster the room is placed on. While the join request is in flight, it warms up the connection to the default cluster, whose URL `GET /api/v1.0/config/` gives, then to the cluster the room is placed on. `LIVEKIT_FORCE_WSS_PROTOCOL` and `LIVEKIT_ENABLE_FIREFOX_PROXY_WORKAROUND` apply to every cluster.

Frontends of earlier releases connect to the URL of `GET /api/v1.0/config/` whatever cluster their token is for: serve this release's frontend before registering a second cluster.

## Setup

### Registering the clusters

`LIVEKIT_CLUSTERS` lists the clusters as JSON. As it holds their API secrets, it is best read from a file, whose path `LIVEKIT_CLUSTERS_FILE` gives, such as a mounted Kubernetes secret:

```json
[
  {
    "name": "paris",
    "url": "https://livekit-paris.example.org",
    "api_key": "<paris API key>",
    "api_secret": "<paris API secret>",
    "weight": 2
  },
  {
    "name": "lyon",
    "url": "https://livekit-lyon.example.org",
    "api_url": "http://livekit-lyon.internal:7880",
    "api_key": "<lyon API key>",
    "api_secret": "<lyon API secret>"
  }
]
```

| Field | Meaning |
|---|---|
| `name` | Lowercase letters, digits and hyphens, 63 characters at most, unique. Placements and recordings record it: renaming a cluster detaches them from it |
| `url` | The URL browsers connect to, `http`, `https`, `ws` or `wss` |
| `api_url` | The URL the backend calls the LiveKit API at, `url` by default |
| `api_key`, `api_secret` | The API key and secret of the cluster. Each cluster needs an API key of its own |
| `weight` | A whole number, 1 by default. 0 keeps the cluster from receiving new rooms |

The first cluster is the default one. Unknown fields are refused, and the backend refuses to start when `LIVEKIT_CLUSTERS` is invalid, listing every problem it found, such as `LIVEKIT_CLUSTERS[1].api_key: LIVEKIT_CLUSTERS[0] already uses this API key, each LiveKit cluster needs its own`. When `LIVEKIT_CLUSTERS` is set, `LIVEKIT_API_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are no longer read.

Every backend process must have the same `LIVEKIT_CLUSTERS`: a process that does not know a cluster places again, at the next join, a room placed there, which splits it from the participants already connected. To add a cluster, register it with a weight of 0 on every process first, then raise its weight. To remove one, set its weight to 0, relocate its rooms, and remove it once none is left.

### Preparing each cluster

With several clusters, turn room auto-creation off on every one of them, so that only the backend creates LiveKit rooms, on the cluster it placed them on:

```yaml
room:
  auto_create: false
```

A participant still holding a token for another cluster, as after a relocation, can then not bring the room back to life there and split its participants. The LiveKit servers of the development stacks run that way, in Docker Compose and in the Helm `dev-keycloak` and `dev-dinum` environments.

Every cluster also needs:

* its webhooks sent to `https://<meet domain>/api/v1.0/rooms/webhooks-livekit/`, signed with its own API key;
* its own egress and agents, see [Recordings, subtitles and agents](#recordings-subtitles-and-agents).

## With a single cluster

Without `LIVEKIT_CLUSTERS`, the registry holds a single cluster named `default`, built from `LIVEKIT_API_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, and nothing else is to be configured. Joins still create the LiveKit room, and answer a `503` when LiveKit fails to create it within `LIVEKIT_API_TIMEOUT_SECONDS`. Room auto-creation may stay on.

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| **LIVEKIT_CLUSTERS** | JSON | unset | The LiveKit clusters, see [Registering the clusters](#registering-the-clusters). Read from the file `LIVEKIT_CLUSTERS_FILE` names, when set. Unset, a single cluster named `default` is built from `LIVEKIT_API_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` |
| **LIVEKIT_PLACEMENT_STRATEGY** | String | `core.livekit.strategies.WeightedRandomStrategy` | Dotted path of the placement strategy, see [Placement strategies](#placement-strategies) |

## Audit events

Relocations emit `livekit.placement.relocate`, and closing the LiveKit room left emits `livekit.room.close`, see the [audit logging catalogue](audit-logging.md#livekit-rooms).
