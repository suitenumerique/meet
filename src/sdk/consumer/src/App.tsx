import { RoomData, VisioCreateButton } from "@gouvfr-lasuite/visio-sdk";
import "./App.css";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "visio-demo-room";

const loadRoom = (): RoomData | undefined => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
};

const saveRoom = (room?: RoomData) => {
  try {
    if (room) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(room));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage is a convenience of this demo
  }
};

type ButtonParams = {
  readOnly: boolean;
  slug?: string;
  code?: string;
};

const paramsFromUrl = (url: URL): ButtonParams => {
  const get = (name: string) => url.searchParams.get(name)?.trim() || undefined;
  return {
    readOnly: url.searchParams.get("readOnly") === "true",
    slug: get("slug"),
    code: get("code"),
  };
};

const urlWithRoom = (url: string, room?: RoomData) => {
  try {
    const next = new URL(url);
    ["slug", "code"].forEach((name) => next.searchParams.delete(name));
    if (room) {
      next.searchParams.set("slug", room.slug);
      if (room.code) next.searchParams.set("code", room.code);
    }
    return next.toString();
  } catch {
    return url;
  }
};

type Load = { id: number; params: ButtonParams; url?: string };
type Received = { callback: string; data?: RoomData; at: string };

function App() {
  const [room, setRoom] = useState(loadRoom);
  const [load, setLoad] = useState<Load>(() => ({
    id: 0,
    params: {
      readOnly: false,
      slug: room?.slug,
      code: room?.code,
    },
  }));
  const [loadedUrl, setLoadedUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [isUrlInvalid, setIsUrlInvalid] = useState(false);
  const [received, setReceived] = useState<Received[]>([]);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const iframe = frame.current?.querySelector("iframe");
    if (!iframe) return;
    // The SDK builds the URL from its props: when the typed URL says more
    // (another param, a value the SDK would drop), load it as typed.
    if (load.url && load.url !== iframe.src) {
      iframe.src = load.url;
    }
    setLoadedUrl(iframe.src);
    setDraftUrl(iframe.src);
  }, [load]);

  const reload = (url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      setIsUrlInvalid(true);
      return;
    }
    setIsUrlInvalid(false);
    setLoad((previous) => ({
      id: previous.id + 1,
      params: paramsFromUrl(parsed),
      url: parsed.toString(),
    }));
  };

  const logReceived = (callback: string, data?: RoomData) => {
    const at = new Date().toLocaleTimeString();
    setReceived((previous) => [{ callback, data, at }, ...previous]);
  };

  return (
    <div className="page">
      <form className="form">
        <div className="header">
          <h2>Create event</h2>
          <span>Visio demo app</span>
        </div>
        <div className="group">
          <label>Subject</label>
          <input type="text" />
        </div>
        <div className="group">
          <label>Place</label>
          <input type="text" />
        </div>
        <div className="group">
          <label>Visioconference</label>
          <div className="frame" ref={frame}>
            <VisioCreateButton
              key={load.id}
              {...load.params}
              onRoomCreated={(data) => {
                setRoom(data);
                saveRoom(data);
                logReceived("onRoomCreated", data);
                setDraftUrl((url) => urlWithRoom(url, data));
              }}
              onClear={() => {
                setRoom(undefined);
                saveRoom(undefined);
                logReceived("onClear");
                setDraftUrl((url) => urlWithRoom(url));
              }}
            />
          </div>
        </div>
        <div className="group">
          <label>Description</label>
          <textarea />
        </div>
        <button
          type="button"
          onClick={() => {
            alert("Room url: " + (room?.url ?? ""));
          }}
        >
          Create
        </button>
      </form>

      <aside className="debug">
        <h3>Iframe URL</h3>
        <span>
          Edit it and reload to give a room back to the button:{" "}
          <code>slug</code>, <code>code</code>, <code>readOnly</code>. The
          dial-in number comes from the Visio instance.
        </span>
        <textarea
          className="url"
          aria-label="Iframe URL"
          rows={4}
          spellCheck={false}
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              reload(draftUrl);
            }
          }}
        />
        <div className="actions">
          <button type="button" onClick={() => reload(draftUrl)}>
            Reload SDK
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={load.params.readOnly}
              onChange={(event) => {
                try {
                  const next = new URL(draftUrl);
                  next.searchParams.set(
                    "readOnly",
                    String(event.target.checked)
                  );
                  reload(next.toString());
                } catch {
                  setIsUrlInvalid(true);
                }
              }}
            />
            Read-only
          </label>
        </div>
        <span className={isUrlInvalid ? "status error" : "status"}>
          {isUrlInvalid
            ? "This is not a valid URL."
            : draftUrl === loadedUrl
              ? "This is the URL loaded in the iframe."
              : "Edited: reload the SDK to load it in the iframe."}
        </span>

        <h3>Received from the iframe</h3>
        {received.length === 0 && <span>Nothing yet: create a room.</span>}
        {received.map(({ callback, data, at }, index) => (
          <div key={received.length - index} className="message">
            <span>
              {at} · <code>{callback}</code>
            </span>
            {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
          </div>
        ))}

        <h3>Stored by this app</h3>
        <span>
          Saved in localStorage, and given back to the button when the page
          loads.
        </span>
        <pre>{room ? JSON.stringify(room, null, 2) : "No room"}</pre>
      </aside>
    </div>
  );
}

export default App;
