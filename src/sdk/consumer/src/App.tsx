import { VisioCreateButton } from "@gouvfr-lasuite/visio-sdk";
import "./App.css";
import { useState } from "react";

function App() {
  const [roomUrl, setRoomUrl] = useState("");

  return (
    <form className="form">
      <div className="header">
        <h2>Create event</h2>
        <span>Visio demo app</span>
      </div>
      <div className="group">
        <label htmlFor="subject">Subject</label>
        <input id="subject" type="text" />
      </div>
      <div className="group">
        <label htmlFor="place">Place</label>
        <input id="place" type="text" />
      </div>
      <div className="group">
        <label>Visioconference</label>
        <VisioCreateButton
          onRoomCreated={(data) => setRoomUrl(data.url)}
          onClear={() => setRoomUrl("")}
        />
      </div>
      <div className="group">
        <label htmlFor="description">Description</label>
        <textarea id="description" />
      </div>
      <button
        type="button"
        onClick={() => {
          alert("Room url: " + roomUrl);
        }}
      >
        Create
      </button>
    </form>
  );
}

export default App;
