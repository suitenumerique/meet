# Breakout rooms

A host can split a meeting into 2 to 20 smaller rooms and later bring everyone back. Nobody leaves the meeting: a room is a group of participants who hear, see and chat only with each other, the host's messages to every room aside, inside the meeting's one LiveKit room.

## What a host does

1. In the meeting, the owner or an administrator opens the breakout panel, picks a number of rooms and assigns each participant to one of them, by hand or with a shuffle.
2. Open starts the split, and every assigned participant is in their room at once, with no reconnection. Everyone else forms the main room: phone callers, anyone left unassigned and anyone who joins later. Hosts stay there too unless placed by hand, the host using the panel included; a random split never moves a host. Each participant sent to a room hears a sound, and every browser shows a banner naming its room while the rooms are open.
3. Close ends the split, and everyone hears and sees everyone again, with a toast and a sound. Cameras stay as they were. A microphone is turned off at every change of room, Close included, and the toast says so.

Only one split can be open in a meeting at a time. While it is open, a host can join any room, or go back to the main room, from the panel: they are in the new room at once, with a sound, and their microphone turns off if it was on. To change anyone else's room, close and open again.

## How the rooms are kept apart

Each browser tells LiveKit who may receive its audio and video: the other members of its room. LiveKit refuses everyone else, whatever their browser does, and cuts off anyone already listening when the list shrinks. Where breakout rooms are enabled, a browser lets nobody receive it until it has read its room from the meeting's metadata, so a participant who joins during a split is never heard outside it.

Chat messages and notifications go to the members of the room by name. A host in the main room can turn on Send to every room in the chat: those messages reach every room, marked To every room, and a browser accepts the mark only from an owner or an administrator, whose role the backend sets in their pass. Each browser also stops playing anyone outside its room, and shows only its room in the grid, the participant list, the participant count, the raised hands and the join messages.

## What is not kept apart

- A phone line cannot tell LiveKit who may receive it, so a browser changed to listen anyway can hear the main room's phone callers. Unmodified browsers do not play them.
- Names, mute states and raised hands still reach every browser. Only the interface hides the other rooms.
- A tab loaded before the release that added breakout rooms knows nothing of a split: it shows every participant and lets anyone receive it.
- A tab loaded while `BREAKOUT_ROOMS_ENABLED` was off keeps to its room once it has read the split, but anyone may hear it for the moment it takes to join.
- LiveKit's recorder receives every room, so a recording cannot start during a split. Opening rooms during a recording stops it, after a warning in the host's panel, and nothing starts it again at Close. A recorder LiveKit still runs without a recording behind it refuses the split.
- The subtitle agent is on no room's list, so subtitles pause during a split.

## Enabling it

Set `BREAKOUT_ROOMS_ENABLED=True` on the backend. It is off by default. The frontend reads it from the config endpoint as `breakout_rooms.is_enabled`.

With the flag off, opening answers 404 to every signed-in caller. A split opened before the flag was turned off can still be listed and closed by a host, who still sees the breakout panel while it is open.

Nothing else is required: no worker, no scheduled task, no extra LiveKit room. Opening first asks LiveKit whether a recorder runs in the meeting. Opening, closing and a host changing room each write the meeting's metadata, and every call to LiveKit gives up after 5 seconds with a 503 the host can retry. Writers of one meeting's metadata take turns through a lock in the cache, so none drops another's key, and a write that timed out keeps the lock until it expires, so the next writer reads after it lands.

## What is stored

- A breakout session per split: the meeting, whether it is still open, and who opened it.
- A breakout room per room: its display name and its position.
- An assignment per participant: the room, the participant's identity in the meeting and their display name at the time.

Closed sessions stay in the database. While a session is active, the meeting's LiveKit metadata carries `{"breakout": {"session_id", "rooms", "assignments"}}`: the room names in order, and the position of each assigned identity's room. Every browser in the meeting reads it.

## Closing

Close removes the `breakout` key from the meeting's metadata, then marks the session closed. If LiveKit fails, the close answers 503 and the session stays open, so closing it again tries again. The split also closes on its own when LiveKit reports the meeting's room as finished, or as started again.

## Limits

- There is no timer: a split stays open until the host closes it.
- Moving a participant other than the host to another room means closing and opening again.
- A guest of a public meeting gets a new identity with every pass, so one who reloads the page while a split is open lands in the main room.
- In a public meeting, anyone with the link can join the main room, so the main room is private from the other rooms only in a meeting that is not public.
