import { useEffect, useMemo, useRef, useState } from "react";
import Arena, { type ArenaTool } from "./Arena";
import { API, WS, del, post } from "./api";
import type { Frame, Metadata, WorldKind } from "./types";

const populations = [
  "LC4", "LPLC2", "LPLC1", "LC10a", "ORN_DM1", "ORN_DM2",
  "SNta", "DNg100", "DNa02", "DNp01", "MDN", "descending_neuron",
];
const bodies = ["fly", "car", "bot", "drone", "walker", "ship", "synth"];
const tools: { kind: ArenaTool; label: string }[] = [
  { kind: "inspect", label: "HAND" },
  { kind: "food", label: "FRUIT" },
  { kind: "stimulus", label: "TARGET" },
  { kind: "loom", label: "LOOM" },
  { kind: "predator", label: "PREDATOR" },
  { kind: "sound", label: "SOUND" },
  { kind: "light", label: "LIGHT" },
  { kind: "obstacle", label: "WALL" },
  { kind: "goal", label: "GOAL" },
];

type Surface = "PLAY" | "LAB" | "BUILD" | "WEIRD";

export default function App() {
  const [entered, setEntered] = useState(false);
  const [surface, setSurface] = useState<Surface>("PLAY");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [selectedFly, setSelectedFly] = useState("prime");
  const [tool, setTool] = useState<ArenaTool>("inspect");
  const [selectedPopulation, setSelectedPopulation] = useState("LC4");
  const [populationRows, setPopulationRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [possessing, setPossessing] = useState(false);
  const [neuralOverlay, setNeuralOverlay] = useState(true);
  const [nameDraft, setNameDraft] = useState("PRIME");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleText, setConsoleText] = useState("");
  const [audioOn, setAudioOn] = useState(false);
  const keys = useRef(new Set<string>());
  const lastMove = useRef(0);
  const audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#box=")) {
      const code = hash.slice(5);
      post("/api/share/import", { code }).catch((e) => setError(String(e)));
    }
  }, []);

  useEffect(() => {
    fetch(`${API}/api/metadata`)
      .then((r) => r.json())
      .then(setMetadata)
      .catch(() => {});
  }, []);

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
      socket.onerror = () => setError("Could not connect to the FLYBOX simulation.");
      socket.onclose = () => {
        if (!stopped) reconnectTimer = window.setTimeout(connect, 1500);
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
    const refresh = () => {
      fetch(`${API}/api/populations/${selectedFly}`)
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((d) => setPopulationRows(d.populations))
        .catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, 650);
    return () => window.clearInterval(id);
  }, [selectedFly]);

  const fly = useMemo(
    () => frame?.flies.find((item) => item.id === selectedFly) ?? frame?.flies[0],
    [frame, selectedFly],
  );

  useEffect(() => {
    if (fly) setNameDraft(fly.name);
  }, [fly?.id]);

  useEffect(() => {
    if (!possessing) return;
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"].includes(e.key)) e.preventDefault();
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const timer = window.setInterval(() => {
      const turn = (keys.current.has("d") || keys.current.has("arrowright") ? 1 : 0)
        - (keys.current.has("a") || keys.current.has("arrowleft") ? 1 : 0);
      const throttle = (keys.current.has("w") || keys.current.has("arrowup") ? 1 : 0)
        - (keys.current.has("s") || keys.current.has("arrowdown") ? 1 : 0);
      if (turn || throttle) {
        post(`/api/flies/${selectedFly}/drive`, { turn, throttle }).catch(() => {});
      }
    }, 80);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.clearInterval(timer);
      keys.current.clear();
    };
  }, [possessing, selectedFly]);

  useEffect(() => {
    if (!audioOn || !fly || !audio.current) return;
    const forward = fly.motor?.forward ?? 0;
    const steer = Math.abs((fly.motor?.steer_L ?? 0) - (fly.motor?.steer_R ?? 0));
    const escape = fly.motor?.escape ?? 0;
    const frequency = 110 + Math.min(900, forward * 26 + steer * 40 + escape * 14);
    audio.current.osc.frequency.setTargetAtTime(frequency, audio.current.ctx.currentTime, 0.035);
    audio.current.gain.gain.setTargetAtTime(Math.min(.055, .005 + fly.dn_activity * .08), audio.current.ctx.currentTime, 0.05);
  }, [audioOn, fly?.motor, fly?.dn_activity]);

  async function safe(action: () => Promise<any>) {
    try {
      setError(null);
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function place(kind: WorldKind, x: number, y: number) {
    const presets: Record<WorldKind, Record<string, unknown>> = {
      food: { intensity: 1, radius: .026, amount: 1, label: "fruit" },
      stimulus: { intensity: .75, radius: .032, label: "target" },
      obstacle: { intensity: 0, radius: .065 },
      loom: { intensity: 1, radius: .038 },
      sound: { intensity: .75, radius: .025, amount: 4, label: "4 Hz" },
      predator: { intensity: 1, radius: .048 },
      light: { intensity: .9, radius: .035 },
      goal: { intensity: 1, radius: .042, label: "finish" },
    };
    await safe(() => post("/api/world", { kind, x, y, ...presets[kind] }));
  }

  function moveObject(id: string, x: number, y: number) {
    const now = performance.now();
    if (now - lastMove.current < 45) return;
    lastMove.current = now;
    post(`/api/world/${id}/move?x=${x}&y=${y}`).catch(() => {});
  }

  async function intervention(type: string, target = selectedPopulation) {
    await safe(() => post(`/api/flies/${selectedFly}/interventions`, {
      type, target, amount: 0.8, fraction: 0.1, seed: 64,
    }));
  }

  async function toggleAudio() {
    if (audio.current) {
      audio.current.osc.stop();
      await audio.current.ctx.close();
      audio.current = null;
      setAudioOn(false);
      return;
    }
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    gain.gain.value = 0.01;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    audio.current = { ctx, osc, gain };
    setAudioOn(true);
  }

  async function runConsole() {
    const command = consoleText.trim();
    if (!command) return;
    await safe(() => post("/api/console", { command }));
    setConsoleText("");
  }

  async function shareBox() {
    if (!frame) return;
    try {
      const response = await fetch(`${API}/api/share`);
      if (!response.ok) throw new Error(await response.text());
      const { code } = await response.json();
      const url = `${window.location.origin}${window.location.pathname}#box=${code}`;
      await navigator.clipboard?.writeText(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!entered) {
    return (
      <main className="intro">
        <div className="intro-grid" />
        <div className="intro-content">
          <div className="eyebrow">FLYBOX / REAL CONNECTOME, WEIRD PLAYGROUND</div>
          <h1>Put a fly brain<br /><span>in anything.</span></h1>
          <p>Feed it. Scare it. Race it. Drive it. Break it. Fork it. Listen to it. Then open the lab and see what the connectome actually did.</p>
          <button className="enter" onClick={() => { setEntered(true); post("/api/simulation/resume").catch(() => {}); }}>
            OPEN THE BOX
          </button>
          <div className="intro-pills">
            <span>PLAYGROUND</span><span>CHALLENGES</span><span>BODY SWAPS</span><span>REAL FLYBRAIN</span>
          </div>
          <small>Neural dynamics come from a simplified connectome simulation. Game mechanics and experimental encoders/decoders are visibly labeled; FLYBOX does not claim biological behavior or consciousness.</small>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="brand">FLYBOX</div>
        <nav className="surface-tabs">
          {(["PLAY","LAB","BUILD","WEIRD"] as Surface[]).map((item) => (
            <button key={item} className={surface === item ? "active" : ""} onClick={() => setSurface(item)}>{item}</button>
          ))}
        </nav>
        <div className="status"><span className="live-dot" /> {frame?.running ? "LIVE" : "PAUSED"}</div>
        <div className="header-stat">{frame?.flies.length ?? 0} AGENTS · {frame?.world.objects.length ?? 0} OBJECTS</div>
        {frame?.mock && <div className="mock">MOCK MODE</div>}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace">
        <div className="arena-pane">
          <div className="toolbar">
            {tools.map(({ kind, label }) => (
              <button key={kind} className={tool === kind ? "active" : ""} onClick={() => setTool(kind)}>
                {label}
              </button>
            ))}
            <span className="toolbar-spacer" />
            <button onClick={() => safe(() => post("/api/world/randomize"))}>🎲 WORLD</button>
            <button onClick={() => safe(() => post("/api/world/daily"))}>DAILY</button>
            <button onClick={() => safe(() => del("/api/world"))}>CLEAR</button>
          </div>

          <Arena
            frame={frame}
            tool={tool}
            selectedFly={selectedFly}
            neuralOverlay={neuralOverlay}
            onPlace={place}
            onMoveObject={moveObject}
            onSelectFly={setSelectedFly}
          />

          <div className="sim-controls">
            <button onClick={() => safe(() => post("/api/simulation/pause"))}>PAUSE</button>
            <button onClick={() => safe(() => post("/api/simulation/resume"))}>PLAY</button>
            <button onClick={() => safe(() => post("/api/simulation/step"))}>+20 ms</button>
            <button onClick={() => safe(() => post("/api/simulation/reset"))}>RESET BOX</button>
            {[0.25,1,2,5,10].map((speed) => (
              <button key={speed} className={frame?.speed === speed ? "active" : ""} onClick={() => safe(() => post(`/api/simulation/speed/${speed}`))}>
                {speed}×
              </button>
            ))}
            <span className="toolbar-spacer" />
            <button className={possessing ? "possessing" : ""} onClick={() => setPossessing(!possessing)}>
              {possessing ? "WASD ACTIVE" : "POSSESS"}
            </button>
          </div>
        </div>

        <aside>
          <AgentHeader
            fly={fly}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            onRename={() => safe(() => post(`/api/flies/${selectedFly}/rename`, { name: nameDraft }))}
            onSpawn={() => safe(() => post("/api/flies"))}
            onFork={() => safe(() => post(`/api/flies/${selectedFly}/fork`))}
          />

          {surface === "PLAY" && (
            <>
              <div className="hero-state">
                <span>{fly?.state ?? "…"}</span>
                <strong>{fly?.energy.toFixed(0) ?? "—"}%</strong>
                <small>ENERGY</small>
              </div>

              <section className="control-section">
                <div className="section-label">BODY</div>
                <div className="body-grid">
                  {bodies.map((body) => (
                    <button key={body} className={fly?.body_type === body ? "active" : ""} onClick={() => safe(() => post(`/api/flies/${selectedFly}/body/${body}`))}>
                      {bodyEmoji(body)} {body.toUpperCase()}
                    </button>
                  ))}
                </div>
              </section>

              <section className="control-section">
                <div className="section-label">BRAIN → BODY RULES</div>
                <div className="segmented">
                  <button className={fly?.controller === "play" ? "active" : ""} onClick={() => safe(() => post(`/api/flies/${selectedFly}/controller/play`))}>PLAY ASSIST</button>
                  <button className={fly?.controller === "lab" ? "active" : ""} onClick={() => safe(() => post(`/api/flies/${selectedFly}/controller/lab`))}>PURE LAB</button>
                </div>
                <p className="microcopy">PLAY adds transparent locomotion/foraging assistance. LAB removes it.</p>
              </section>

              <section className="control-section">
                <div className="section-label">WHAT IT SENSES</div>
                <Signal label="FOOD SMELL" value={fly?.senses?.food_odor ?? 0} />
                <Signal label="TARGET" value={fly?.senses?.target ?? 0} />
                <Signal label="LOOM" value={fly?.senses?.loom ?? 0} />
                <Signal label="DANGER" value={fly?.senses?.threat ?? 0} />
                <Signal label="SOUND" value={fly?.senses?.sound ?? 0} />
                <Signal label="TOUCH" value={fly?.senses?.touch ?? 0} />
              </section>

              <ChallengePanel frame={frame} onStart={(id) => safe(() => post(`/api/challenges/${id}`))} onReveal={() => safe(() => post("/api/challenges/mystery/reveal"))} />

              <section className="control-section">
                <div className="section-label">ACHIEVEMENTS</div>
                <div className="achievement-list">
                  {(frame?.achievements ?? []).length === 0 && <span className="empty">make something weird happen</span>}
                  {(frame?.achievements ?? []).map((a) => <span key={a.key} title={a.description}>★ {a.title}</span>)}
                </div>
              </section>
            </>
          )}

          {surface === "LAB" && (
            <>
              <div className="metrics">
                <Metric label="FIRED" value={fly ? fly.fired_count.toLocaleString() : "—"} />
                <Metric label="NEW" value={fly ? fly.newly_firing.toLocaleString() : "—"} />
                <Metric label="DN TRACE" value={fly ? fly.dn_activity.toFixed(3) : "—"} />
                <Metric label="JACCARD Δ" value={fly ? fly.firing_jaccard_distance.toFixed(3) : "—"} />
              </div>

              <section className="control-section">
                <div className="section-label">NAMED MOTOR READOUT</div>
                <Signal label="FORWARD · DNg100" value={fly?.motor?.forward ?? 0} max={20} />
                <Signal label="STEER L · DNa02" value={fly?.motor?.steer_L ?? 0} max={20} />
                <Signal label="STEER R · DNa02" value={fly?.motor?.steer_R ?? 0} max={20} />
                <Signal label="ESCAPE · DNp01" value={fly?.motor?.escape ?? 0} max={20} />
                <Signal label="BACKWARD · MDN" value={fly?.motor?.backward ?? 0} max={20} />
              </section>

              <section className="control-section">
                <div className="section-label">SENSORY GAIN</div>
                <input
                  type="range" min="0" max="2" step="0.05" defaultValue="1"
                  onChange={(e) => safe(() => post(`/api/flies/${selectedFly}/sensory-gain/${e.target.value}`))}
                />
              </section>

              <section className="control-section">
                <div className="section-label">BRAIN SURGERY</div>
                <select value={selectedPopulation} onChange={(e) => setSelectedPopulation(e.target.value)}>
                  {populations.map((p) => <option key={p}>{p}</option>)}
                </select>
                <div className="surgery-actions">
                  <button onClick={() => intervention("stimulate_population")}>STIM</button>
                  <button onClick={() => intervention("silence_population")}>SILENCE</button>
                  <button onClick={() => intervention("restore_population")}>RESTORE</button>
                </div>
                <button className="danger" onClick={() => safe(() => post(`/api/flies/${selectedFly}/interventions`, { type: "random_synapse_lesion", fraction: 0.1, seed: 64 }))}>
                  10% SEEDED LESION
                </button>
              </section>

              <section className="population-table">
                {populationRows.map((row) => (
                  <div key={row.name} className={row.silenced ? "population-row silenced" : "population-row"}>
                    <span>{row.name}</span><b>{row.firing}/{row.neurons}</b>
                  </div>
                ))}
              </section>

              <Provenance metadata={metadata} />
            </>
          )}

          {surface === "BUILD" && (
            <>
              <section className="control-section no-top">
                <div className="section-label">BUILD A TINY WORLD</div>
                <h3>Pick a tool. Click the arena. Drag objects with HAND.</h3>
                <div className="build-guide">
                  <p>🍌 <b>Fruit</b> emits an experimental ORN_DM1/DM2 odor field.</p>
                  <p>⚫ <b>Loom</b> uses angular growth → LPLC2; close threats also drive LC4.</p>
                  <p>🔊 <b>Sound</b> pulses JO-A/JO-B auditory populations.</p>
                  <p>💡 <b>Light</b> projects onto FlyBrain photoreceptor azimuths.</p>
                  <p>☠ <b>Predator</b> is draggable and can catch agents.</p>
                  <p>█ <b>Wall</b> produces SNta touch on collision.</p>
                </div>
              </section>
              <section className="control-section">
                <button className="wide" onClick={() => safe(() => post("/api/world/randomize"))}>🎲 RANDOM WORLD</button>
                <button className="wide" onClick={() => safe(() => post("/api/world/daily"))}>☀ DAILY SEEDED WORLD</button>
                <button className="wide" onClick={shareBox}>COPY SHARE LINK</button>
                <div className="seed">SEED {frame?.world.seed ?? "—"}</div>
              </section>
            </>
          )}

          {surface === "WEIRD" && (
            <>
              <section className="control-section no-top">
                <div className="section-label">WEIRD STUFF</div>
                <button className="wide" onClick={() => setNeuralOverlay(!neuralOverlay)}>
                  {neuralOverlay ? "HIDE" : "SHOW"} NEURAL FIREWORKS
                </button>
                <button className="wide" onClick={toggleAudio}>
                  {audioOn ? "STOP BRAIN TONE" : "LISTEN TO BRAIN TONE"}
                </button>
                <button className="wide" onClick={() => safe(() => post(`/api/flies/${selectedFly}/fork`))}>FORK THIS BRAIN NOW</button>
                <button className="wide" onClick={() => safe(() => post("/api/flies?clone_prime=true&body_type=car&name=BRAINCAR"))}>SPAWN BRAIN CAR</button>
                <button className="wide" onClick={() => safe(() => post("/api/flies?body_type=synth&name=SYNTHFLY"))}>SPAWN SYNTH BRAIN</button>
                <button className="danger wide" onClick={() => safe(() => post(`/api/flies/${selectedFly}/interventions`, { type: "random_synapse_lesion", fraction: 0.1, seed: Math.floor((frame?.world.seed ?? 64) % 100000) }))}>CHAOS BUTTON</button>
              </section>
              <section className="control-section">
                <div className="section-label">BODY SWAP</div>
                <div className="body-grid">
                  {bodies.map((body) => <button key={body} onClick={() => safe(() => post(`/api/flies/${selectedFly}/body/${body}`))}>{bodyEmoji(body)} {body}</button>)}
                </div>
              </section>
              <p className="science-note">Bodies, neural fireworks, sound mapping and PLAY assists are game/visualization layers. The underlying spikes remain FlyBrain simulation output.</p>
            </>
          )}
        </aside>
      </section>

      <section className="timeline">
        <div className="timeline-head">
          <span>TIME MACHINE / LIVE LOG</span>
          <span>T+ {frame?.t.toFixed(3) ?? "0.000"} s</span>
          <button onClick={() => setConsoleOpen(!consoleOpen)}>&gt;_ CONSOLE</button>
          <a href={`${API}/api/experiments/export`} target="_blank">EXPORT JSON</a>
        </div>
        {consoleOpen && (
          <div className="console">
            <span>&gt;</span>
            <input value={consoleText} onChange={(e) => setConsoleText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runConsole()} placeholder="stim LC4 0.8 · silence LC10a · spawn food .5 .5 · fork · random 42 · challenge race" />
            <button onClick={runConsole}>RUN</button>
          </div>
        )}
        <div className="events">
          {[...(frame?.events ?? [])].reverse().slice(0, 9).map((e, i) => (
            <div className="event" key={i}>
              <time>{e.t.toFixed(3)}</time>
              <span className={`event-kind ${e.kind}`}>{e.kind}</span>
              <p>{e.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AgentHeader({ fly, nameDraft, setNameDraft, onRename, onSpawn, onFork }: any) {
  return (
    <>
      <div className="panel-title-row">
        <div>
          <div className="eyebrow">ACTIVE AGENT</div>
          <h2>{fly?.name ?? "—"}</h2>
        </div>
        <div className="agent-actions">
          <button onClick={onSpawn}>+ AGENT</button>
          <button onClick={onFork}>FORK</button>
        </div>
      </div>
      <div className="rename-row">
        <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
        <button onClick={onRename}>RENAME</button>
      </div>
    </>
  );
}

function ChallengePanel({ frame, onStart, onReveal }: any) {
  const items = [
    ["food_run", "🍌 SNACK ATTACK"],
    ["survive", "☠ SURVIVE"],
    ["race", "🏁 RACE"],
    ["maze", "🧩 MAZE"],
    ["tournament", "🏆 TOURNAMENT"],
    ["hijack", "⚡ HIJACK"],
    ["mystery", "❓ MYSTERY BRAIN"],
    ["sandbox", "🧪 SANDBOX"],
  ];
  return (
    <section className="control-section">
      <div className="section-label">CHALLENGES</div>
      <div className="challenge-grid">
        {items.map(([id, label]) => <button key={id} className={frame?.challenge.id === id ? "active" : ""} onClick={() => onStart(id)}>{label}</button>)}
      </div>
      {frame?.challenge.id === "hijack" && <p className="microcopy">STIM BUDGET: {frame.challenge.actions}/{frame.challenge.budget}</p>}
      {frame?.challenge.id === "mystery" && frame.challenge.secret_hidden && <button className="wide" onClick={onReveal}>REVEAL SECRET</button>}
      {frame?.challenge.completed && <div className="challenge-win">CHALLENGE COMPLETE</div>}
    </section>
  );
}

function Provenance({ metadata }: { metadata: Metadata | null }) {
  return (
    <section className="control-section provenance">
      <div className="section-label">IS THIS REAL?</div>
      {metadata?.provenance && Object.entries(metadata.provenance).map(([key, item]) => (
        <details key={key}>
          <summary>{item.label}</summary>
          <p>{item.description}</p>
        </details>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Signal({ label, value, max = 0.8 }: { label: string; value: number; max?: number }) {
  const width = Math.max(0, Math.min(100, value / max * 100));
  return (
    <div className="signal">
      <div><span>{label}</span><b>{value.toFixed(2)}</b></div>
      <i><em style={{ width: `${width}%` }} /></i>
    </div>
  );
}

function bodyEmoji(body: string) {
  return ({ fly: "🪰", car: "🚗", bot: "🤖", drone: "✣", walker: "🕷", ship: "🚀", synth: "🎹" } as Record<string,string>)[body] ?? "●";
}
