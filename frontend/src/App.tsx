import { useEffect, useMemo, useState } from "react";
import Arena from "./Arena";
import { API, WS, del, post } from "./api";
import type { Frame } from "./types";

const populations = ["LC4", "LPLC2", "LC10a", "LC6", "LC16", "LC15", "descending_neuron"];

export default function App() {
  const [entered, setEntered] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [selectedFly, setSelectedFly] = useState("prime");
  const [tool, setTool] = useState<"inspect" | "food" | "stimulus" | "loom" | "obstacle">("inspect");
  const [selectedPopulation, setSelectedPopulation] = useState("LC4");
  const [populationRows, setPopulationRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(WS);
      socket.onopen = () => setError(null);
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "frame") setFrame(data);
        if (data.type === "error") {
          setError(data.message + (data.error ? ` — ${data.error}` : ""));
        }
      };
      socket.onerror = () => setError("Could not connect to FLY.LAB backend.");
      socket.onclose = () => {
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (!frame) return;
    fetch(`${API}/api/populations/${selectedFly}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("population fetch failed")))
      .then((d) => setPopulationRows(d.populations))
      .catch(() => {});
  }, [frame?.t, selectedFly]);

  const fly = useMemo(
    () => frame?.flies.find((f) => f.id === selectedFly) ?? frame?.flies[0],
    [frame, selectedFly]
  );

  async function safe(action: () => Promise<any>) {
    try {
      setError(null);
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function place(kind: string, x: number, y: number) {
    await safe(() => post("/api/world", {
      kind, x, y,
      intensity: kind === "loom" ? 1.0 : 0.8,
      radius: kind === "obstacle" ? 0.065 : 0.035,
    }));
  }

  async function intervention(type: string) {
    await safe(() => post(`/api/flies/${selectedFly}/interventions`, {
      type,
      target: selectedPopulation,
      amount: 0.8,
      fraction: 0.1,
      seed: 64,
    }));
  }

  if (!entered) {
    return (
      <main className="intro">
        <div className="intro-grid" />
        <div className="intro-content">
          <div className="eyebrow">FLY.LAB / CONNECTOME SANDBOX</div>
          <h1>166,700 neurons.<br />25,582,938 synapses.<br /><span>One reconstructed fly connectome.</span></h1>
          <p>Put it in a world. Stimulate it. Damage it. Clone it. Fork its timeline. See what changes.</p>
          <button className="enter" onClick={() => setEntered(true)}>ENTER FLY.LAB</button>
          <small>FLY.LAB uses a simplified connectome-based simulation. It does not claim to reproduce a complete biological fly brain or consciousness.</small>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="brand">FLY.LAB</div>
        <div className="status"><span className="live-dot" /> {frame?.running ? "LIVE" : "PAUSED"}</div>
        <div className="header-stat">166,700 N / 25,582,938 S</div>
        {frame?.mock && <div className="mock">MOCK MODE</div>}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace">
        <div className="arena-pane">
          <div className="toolbar">
            {(["inspect","food","stimulus","loom","obstacle"] as const).map((name) => (
              <button key={name} className={tool === name ? "active" : ""} onClick={() => setTool(name)}>
                {name.toUpperCase()}
              </button>
            ))}
            <button onClick={() => safe(() => del("/api/world"))}>CLEAR</button>
          </div>

          <Arena frame={frame} tool={tool} onPlace={place} onSelectFly={setSelectedFly} />

          <div className="sim-controls">
            <button onClick={() => safe(() => post("/api/simulation/pause"))}>PAUSE</button>
            <button onClick={() => safe(() => post("/api/simulation/resume"))}>RESUME</button>
            <button onClick={() => safe(() => post("/api/simulation/step"))}>STEP</button>
            <button onClick={() => safe(() => post("/api/simulation/reset"))}>RESET</button>
            {[0.25,1,2,5,10].map((speed) => (
              <button key={speed} className={frame?.speed === speed ? "active" : ""} onClick={() => safe(() => post(`/api/simulation/speed/${speed}`))}>
                {speed}×
              </button>
            ))}
          </div>
        </div>

        <aside>
          <div className="panel-title-row">
            <div>
              <div className="eyebrow">SELECTED AGENT</div>
              <h2>{fly?.is_prime ? "PRIME" : fly?.name ?? "—"}</h2>
            </div>
            <button onClick={() => safe(() => post("/api/flies?clone_prime=true"))}>CLONE PRIME</button>
          </div>

          <div className="metrics">
            <Metric label="FIRED" value={fly ? fly.fired_count.toLocaleString() : "—"} />
            <Metric label="NEW" value={fly ? fly.newly_firing.toLocaleString() : "—"} />
            <Metric label="DN ACTIVITY" value={fly ? fly.dn_activity.toFixed(3) : "—"} />
            <Metric label="JACCARD Δ" value={fly ? fly.firing_jaccard_distance.toFixed(3) : "—"} />
            <Metric label="ENERGY" value={fly ? fly.energy.toFixed(1) : "—"} />
            <Metric label="SPEED" value={fly ? fly.speed.toFixed(3) : "—"} />
          </div>

          <section className="control-section">
            <div className="section-label">BRAIN CONTROL</div>
            <label>
              Sensory gain
              <input
                type="range" min="0" max="2" step="0.05" defaultValue="1"
                onChange={(e) => safe(() => post(`/api/flies/${selectedFly}/sensory-gain/${e.target.value}`))}
              />
            </label>
          </section>

          <section className="control-section">
            <div className="section-label">BRAIN SURGERY</div>
            <select value={selectedPopulation} onChange={(e) => setSelectedPopulation(e.target.value)}>
              {populations.map((p) => <option key={p}>{p}</option>)}
            </select>
            <div className="surgery-actions">
              <button onClick={() => intervention("stimulate_population")}>STIMULATE</button>
              <button onClick={() => intervention("silence_population")}>SILENCE</button>
              <button onClick={() => intervention("restore_population")}>RESTORE</button>
            </div>
            <button className="danger" onClick={() => safe(() => post(`/api/flies/${selectedFly}/interventions`, { type: "random_synapse_lesion", fraction: 0.1, seed: 64 }))}>
              10% RANDOM SYNAPSE LESION
            </button>
          </section>

          <section className="population-table">
            {populationRows.map((row) => (
              <div key={row.name} className={row.silenced ? "population-row silenced" : "population-row"}>
                <span>{row.name}</span><b>{row.firing}/{row.neurons}</b>
              </div>
            ))}
          </section>

          <div className="science-note">
            Movement uses an <b>Experimental Motor Mapping</b>: side-specific descending-neuron firing drives turn and total descending-neuron firing drives speed. This is an engineering decoder, not biological motor ground truth.
          </div>
        </aside>
      </section>

      <section className="timeline">
        <div className="timeline-head">
          <span>TIME MACHINE / EXPERIMENT LOG</span>
          <span>T+ {frame?.t.toFixed(3) ?? "0.000"} s</span>
          <a href={`${API}/api/experiments/export`} target="_blank">EXPORT JSON</a>
        </div>
        <div className="events">
          {[...(frame?.events ?? [])].reverse().slice(0, 8).map((e, i) => (
            <div className="event" key={i}>
              <time>{e.t.toFixed(3)}</time><span className={`event-kind ${e.kind}`}>{e.kind}</span><p>{e.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
