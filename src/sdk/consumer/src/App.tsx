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
        <label>Subject</label>
        <input type="text" />
      </div>
      <div className="group">
        <label>Place</label>
        <input type="text" />
      </div>
      <div className="group">
        <label>Visioconference</label>
        <VisioCreateButton onRoomCreated={setRoomUrl} />
      </div>
      <div className="group">
        <label>Description</label>
        <textarea />
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
