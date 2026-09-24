import { useEffect, useMemo, useRef, useState } from "react";
import Arena, { type ArenaTool } from "./Arena";
import BrainView from "./BrainView";
import HomeDocs from "./HomeDocs";
import { closeSession, connectFrames, del, get, post } from "./api";
import type { Frame, Metadata, WorldKind } from "./types";

const populations = [
  "LC4", "LPLC2", "LPLC1", "LC10a", "ORN_DM1", "ORN_DM2",
  "SNta", "DNg100", "DNa02", "DNp01", "MDN", "descending_neuron",
];
const bodies = ["fly", "car", "bot", "drone", "walker", "ship", "synth"];
const tools: { kind: ArenaTool; label: string }[] = [
  { kind: "inspect", label: "HAND" },
  { kind: "food", label: "FRUIT" },
  { kind: "odor", label: "ODOR PAINT" },
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
  const [cinematic, setCinematic] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const keys = useRef(new Set<string>());
  const lastMove = useRef(0);
  const audio = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);

  useEffect(() => {
    if (!entered) return;
    get("/api/metadata")
      .then(setMetadata)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [entered, frame?.runtime?.status]);

  useEffect(() => {
    const discard = () => closeSession();
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
    };
  }, []);

  useEffect(() => {
    if (!entered) return;
    return connectFrames(
      (data) => {
        setFrame(data);
        setError(data.runtime?.status === "error" ? data.runtime.error ?? "Browser connectome failed to load." : null);
      },
      (message) => setError(message),
    );
  }, [entered]);

  useEffect(() => {
    if (!entered) return;
    const refresh = () => {
      get(`/api/populations/${selectedFly}`)
        .then((d) => setPopulationRows(d.populations))
        .catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, 650);
    return () => window.clearInterval(id);
  }, [selectedFly, entered]);

  const fly = useMemo(
    () => frame?.flies.find((item) => item.id === selectedFly) ?? frame?.flies[0],
    [frame, selectedFly],
  );

  const runtimeStatus = frame?.runtime?.status;
  const statusText =
    runtimeStatus === "loading"
      ? "LOADING BRAIN"
      : runtimeStatus === "error"
        ? "BRAIN ERROR"
        : frame?.running
          ? "LIVE"
          : "PAUSED";
  const runtimeText =
    runtimeStatus === "loading"
      ? frame?.runtime?.progress ?? "loading connectome"
      : runtimeStatus === "ready"
        ? "LOCAL CPU · REAL CONNECTOME"
        : runtimeStatus === "error"
          ? "CONNECTOME LOAD FAILED"
          : frame?.mock
            ? "MOCK MODE"
            : null;

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
      odor: { intensity: .72, radius: .018, amount: .55, label: "odor" },
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

  function moveFly(id: string, x: number, y: number) {
    const now = performance.now();
    if (now - lastMove.current < 45) return;
    lastMove.current = now;
    post(`/api/flies/${id}/move?x=${x}&y=${y}`).catch(() => {});
  }

  function moveObject(id: string, x: number, y: number) {
    const now = performance.now();
    if (now - lastMove.current < 45) return;
    lastMove.current = now;
    post(`/api/world/${id}/move?x=${x}&y=${y}`).catch(() => {});
  }

  function removeObject(id: string) {
    del(`/api/world/${id}`).catch((e) => setError(e instanceof Error ? e.message : String(e)));
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

  async function runBatchProbe() {
    setBatchBusy(true);
    try {
      const result = await safe(() => post("/api/batch/probe", {
        population: selectedPopulation,
        amount: 0.8,
        steps: 50,
        replicates: 4,
        seed: frame?.world.seed ?? 64,
      }));
      if (result) setBatchResult(result);
    } finally {
      setBatchBusy(false);
    }
  }

  async function runConsole() {
    const command = consoleText.trim();
    if (!command) return;
    await safe(() => post("/api/console", { command }));
    setConsoleText("");
  }

  async function downloadExport() {
    const data = await safe(() => get("/api/experiments/export"));
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `flybox-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }


  if (!entered) {
    return (
      <HomeDocs
        onEnter={() => {
          setEntered(true);
          post("/api/simulation/resume").catch((e) => setError(e instanceof Error ? e.message : String(e)));
        }}
      />
    );
  }

  return (
    <div className={cinematic ? "app cinematic" : "app"}>
      <header>
        <div className="brand">FLYBOX</div>
        <nav className="surface-tabs">
          {(["PLAY","LAB","BUILD","WEIRD"] as Surface[]).map((item) => (
            <button key={item} className={surface === item ? "active" : ""} onClick={() => setSurface(item)}>{item}</button>
          ))}
        </nav>
        <div className="status"><span className="live-dot" /> {statusText}</div>
        <div className="header-stat">{frame?.flies.length ?? 0} AGENTS · {frame?.world.objects.length ?? 0} OBJECTS · EPHEMERAL</div>
        {runtimeText && <div className="mock">{runtimeText}</div>}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="workspace">
        <div className="arena-pane">
          {cinematic && <button className="cinema-exit" onClick={() => setCinematic(false)}>EXIT CINEMA</button>}
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
            onMoveFly={moveFly}
            onRemoveObject={removeObject}
            onSelectFly={setSelectedFly}
          />

          <div className="sim-controls">
            <button onClick={() => safe(() => post("/api/simulation/pause"))}>PAUSE</button>
            <button onClick={() => safe(() => post("/api/simulation/resume"))}>PLAY</button>
            <button onClick={() => safe(() => post("/api/simulation/step"))}>+20 ms</button>
            <button onClick={() => safe(() => post("/api/simulation/reset"))}>RESET BOX</button>
            {[0.05,0.25,1,2,5,10].map((speed) => (
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

              <WhyCard fly={fly} />

              <section className="control-section">
                <div className="section-label">BRAIN → BODY RULES</div>
                <div className="segmented">
                  <button className={fly?.controller === "play" ? "active" : ""} onClick={() => safe(() => post(`/api/flies/${selectedFly}/controller/play`))}>PLAY ASSIST</button>
                  <button className={fly?.controller === "lab" ? "active" : ""} onClick={() => safe(() => post(`/api/flies/${selectedFly}/controller/lab`))}>PURE LAB</button>
                </div>
                <p className="microcopy">PLAY adds transparent locomotion/foraging assistance. LAB removes it.</p>
              </section>

              {fly?.controller === "play" && (
                <section className="control-section assist-panel">
                  <div className="section-label">GAME ASSIST · NOT BIOLOGY</div>
                  <Signal label="FORAGE STEER" value={Math.abs(fly?.assists?.forage ?? 0)} max={1.25} />
                  <Signal label="TARGET / GOAL" value={Math.abs(fly?.assists?.target ?? 0)} max={1.65} />
                  <Signal label="SOUND / LIGHT ORIENT" value={Math.abs(fly?.assists?.orient ?? 0)} max={0.65} />
                  <Signal label="PREDATOR / LOOM AVOID" value={Math.abs(fly?.assists?.avoid ?? 0)} max={2.25} />
                  <Signal label="WALL AVOID" value={Math.abs(fly?.assists?.obstacle ?? 0)} max={2.6} />
                  <Signal label="EDGE REFLEX" value={Math.abs(fly?.assists?.edge ?? 0)} max={2.7} />
                  <Signal label="SEARCH WOBBLE" value={Math.abs(fly?.assists?.search ?? 0)} max={0.6} />
                  <p className="microcopy">These body commands make PLAY fun. Switch to PURE LAB to remove all three.</p>
                </section>
              )}

              <section className="control-section">
                <div className="section-label">WHAT IT SENSES</div>
                <Signal label="FOOD SMELL" value={fly?.senses?.food_odor ?? 0} />
                <Signal label="TARGET" value={fly?.senses?.target ?? 0} />
                <Signal label="OBSTACLE" value={fly?.senses?.obstacle ?? 0} />
                <Signal label="LOOM" value={fly?.senses?.loom ?? 0} />
                <Signal label="DANGER" value={fly?.senses?.threat ?? 0} />
                <Signal label="SOUND" value={fly?.senses?.sound ?? 0} />
                <Signal label="TOUCH" value={fly?.senses?.touch ?? 0} />
              </section>

              <ChallengePanel frame={frame} onStart={(id: string) => safe(() => post(`/api/challenges/${id}`))} onReveal={() => safe(() => post("/api/challenges/mystery/reveal"))} />

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
              <BrainView fly={fly} />

              <div className="metrics">
                <Metric label="FIRED" value={fly ? fly.fired_count.toLocaleString() : "—"} />
                <Metric label="NEW" value={fly ? fly.newly_firing.toLocaleString() : "—"} />
                <Metric label="DN TRACE" value={fly ? fly.dn_activity.toFixed(3) : "—"} />
                <Metric label="JACCARD Δ" value={fly ? fly.firing_jaccard_distance.toFixed(3) : "—"} />
              </div>

              {(frame?.comparisons.length ?? 0) > 0 && (
                <section className="control-section">
                  <div className="section-label">LIVE A/B DIVERGENCE</div>
                  {frame?.comparisons.slice(0, 4).map((row) => (
                    <div className="compare-row" key={row.a + row.b}>
                      <span>{row.a_name} ↔ {row.b_name}</span>
                      <b>NEURAL {row.neural_divergence.toFixed(2)} · SPACE {row.behavioral_divergence.toFixed(2)}</b>
                    </div>
                  ))}
                </section>
              )}

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

              <section className="control-section">
                <div className="section-label">BATCH SCIENCE PROBE</div>
                <p className="microcopy">Run 4 independent neural states on one shared FlyBrain connectome for 50 steps while stimulating the selected population.</p>
                <button className="wide" disabled={batchBusy || frame?.mock} onClick={runBatchProbe}>
                  {frame?.mock ? "REAL FLYBRAIN REQUIRED" : batchBusy ? "RUNNING…" : `RUN 4× ${selectedPopulation} PROBE`}
                </button>
                {batchResult && (
                  <div className="batch-result">
                    <span>{batchResult.population} · {batchResult.population_neurons} neurons</span>
                    <b>DN TRACE {batchResult.summary.mean_dn_trace.toFixed(3)} ± {batchResult.summary.sd_dn_trace.toFixed(3)}</b>
                    <small>{batchResult.steps} steps · {batchResult.replicates} replicates · seed {batchResult.seed}</small>
                  </div>
                )}
              </section>

              <Provenance metadata={metadata} />
            </>
          )}

          {surface === "BUILD" && (
            <>
              <section className="control-section no-top">
                <div className="section-label">BUILD A TINY WORLD</div>
                <h3>Pick a tool. Click the arena. Drag with HAND. Right-click an element to delete it.</h3>
                <div className="build-guide">
                  <p>🍌 <b>Fruit</b> emits an experimental ORN_DM1/DM2 odor field and can be eaten.</p>
                  <p>〰 <b>Odor Paint</b> lets you draw non-edible ORN_DM1/DM2 smell trails directly onto the arena.</p>
                  <p>🖐 <b>Hand</b> can grab agents or drag world objects while the simulation is live. Right-click any placed element to remove it.</p>
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
                <div className="environment-grid">
                  <button onClick={() => safe(() => post("/api/world/environment", { daylight: 1, wind_x: 0, wind_y: 0 }))}>☀ DAY</button>
                  <button onClick={() => safe(() => post("/api/world/environment", { daylight: 0.08, wind_x: 0, wind_y: 0 }))}>☾ NIGHT</button>
                  <button onClick={() => safe(() => post("/api/world/environment", { daylight: frame?.world.daylight ?? 1, wind_x: -0.08, wind_y: 0 }))}>← WIND</button>
                  <button onClick={() => safe(() => post("/api/world/environment", { daylight: frame?.world.daylight ?? 1, wind_x: 0.08, wind_y: 0 }))}>WIND →</button>
                </div>
                <div className="session-note">THIS BOX EXISTS ONLY FOR THIS PAGE. LEAVING DISCARDS IT.</div>
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
                <button className="wide" onClick={() => setCinematic(true)}>CINEMA MODE</button>
                <button className="wide" onClick={toggleAudio}>
                  {audioOn ? "STOP BRAIN TONE" : "LISTEN TO BRAIN TONE"}
                </button>
                <button className="wide" onClick={() => safe(() => post(`/api/flies/${selectedFly}/fork`))}>FORK THIS BRAIN NOW</button>
                <button className="wide" onClick={() => safe(() => post("/api/flies?clone_prime=true&body_type=car&name=BRAINCAR"))}>SPAWN BRAIN CAR</button>
                <button className="wide" onClick={() => safe(() => post("/api/flies?body_type=synth&name=SYNTHFLY"))}>SPAWN SYNTH BRAIN</button>
                <button
                  className="wide"
                  disabled={(frame?.flies.length ?? 0) < 2}
                  onClick={() => {
                    const other = frame?.flies.find((item) => item.id !== selectedFly);
                    if (other) safe(() => post("/api/couplings", { source: selectedFly, target: other.id, population: "LC10a", gain: 0.7 }));
                  }}
                >
                  CONNECT THIS BRAIN → ANOTHER
                </button>
                {(frame?.couplings.length ?? 0) > 0 && <button className="wide" onClick={() => safe(() => del("/api/couplings"))}>DISCONNECT BRAINS</button>}
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
          <button onClick={() => safe(() => post("/api/time/checkpoint"))}>SAVE MOMENT</button>
          <button disabled={(frame?.checkpoints.length ?? 0) === 0} onClick={() => safe(() => post("/api/time/rewind"))}>↶ REWIND</button>
          <button onClick={() => setConsoleOpen(!consoleOpen)}>&gt;_ CONSOLE</button>
          <button onClick={downloadExport}>EXPORT JSON</button>
        </div>
        {(frame?.checkpoints.length ?? 0) > 0 && (
          <div className="checkpoint-strip">
            {frame?.checkpoints.slice(-6).map((cp) => (
              <button key={cp.id} onClick={() => safe(() => post(`/api/time/rewind?checkpoint_id=${cp.id}`))}>
                ↶ {cp.label}
              </button>
            ))}
          </div>
        )}
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

function WhyCard({ fly }: any) {
  if (!fly) return null;
  let title = "It is deciding what to do.";
  let detail = "The connectome is running; PLAY may also add the labeled locomotion assist so the embodied agent can explore.";

  if (!fly.alive) {
    title = fly.state === "CAUGHT" ? "The predator caught it." : "It ran out of energy.";
    detail = "Death/energy are game mechanics; the neural state is still reported separately.";
  } else if (fly.state === "FEEDING") {
    title = "It found food and stopped to eat.";
    detail = "Food creates an ORN_DM1/ORN_DM2 odor input. Feeding and energy gain are game mechanics.";
  } else if (fly.state === "ESCAPING") {
    title = "Its escape channel fired strongly.";
    detail = "Looming/threat encoders can drive LPLC2/LC4; the displayed escape readout is DNp01.";
  } else if (fly.state === "POSSESSED") {
    title = "You are driving the body.";
    detail = "WASD adds an explicit manual body command while the connectome keeps receiving sensory input.";
  } else if (Math.abs(fly.assists?.obstacle ?? 0) > 0.10) {
    title = "It sees a wall in its path and is turning away.";
    detail = "Wall avoidance is a PLAY reflex before collision; physical contact also produces an SNta touch input and a stronger tactile turn.";
  } else if (Math.abs(fly.assists?.edge ?? 0) > 0.10) {
    title = "It is turning back into the arena.";
    detail = "PLAY treats the box edge like a wall before impact. If it still reaches the boundary, the body reflects and continues instead of getting pinned.";
  } else if (Math.abs(fly.assists?.target ?? 0) > 0.08) {
    title = "It is steering toward the target.";
    detail = "TARGET/GOAL steering is an explicit PLAY assist. The target also drives the experimental LC10a sensory encoder; PURE LAB removes the body assist.";
  } else if (Math.abs(fly.assists?.orient ?? 0) > 0.05) {
    title = "It is orienting toward a sound or light.";
    detail = "This visible orientation is a PLAY game assist; the sensory stimulus is still injected through its separately labeled neural encoder.";
  } else if ((fly.senses?.food_odor ?? 0) > 0.15) {
    title = "It can smell nearby food.";
    detail = `Food odor input is ${fly.senses.food_odor.toFixed(2)}. In PLAY, hunger makes that cue more influential on the game locomotion assist.`;
  } else if ((fly.senses?.loom ?? 0) > 0.08) {
    title = "Something is expanding in its view.";
    detail = "Angular growth drives the experimental LPLC2 looming encoder; downstream connectome activity remains simulated FlyBrain output.";
  } else if (fly.controller === "lab" && Math.abs(fly.speed) < 0.01) {
    title = "It is sitting still — and that is valid.";
    detail = "LAB removes the locomotion assist. This simplified spiking connectome often does not produce a strong DNg100 walking command from ordinary sensory input.";
  }

  return (
    <section className="why-card">
      <span>WHY?</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </section>
  );
}

function ChallengePanel({ frame, onStart, onReveal }: any) {
  const items = [
    ["food_run", "🍌 SNACK ATTACK"],
    ["survive", "☠ SURVIVE"],
    ["hunt", "🖱 YOU vs FLY"],
    ["race", "🏁 RACE"],
    ["braincar", "🚗 BRAIN CAR"],
    ["maze", "🧩 MAZE"],
    ["tournament", "🏆 TOURNAMENT"],
    ["hijack", "⚡ HIJACK"],
    ["mystery", "❓ MYSTERY BRAIN"],
    ["history", "🧠 RECENT HISTORY"],
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
      {frame?.challenge.id === "history" && frame.challenge.history && (
        <HistoryChallenge frame={frame} />
      )}
      {frame?.challenge.completed && <div className="challenge-win">CHALLENGE COMPLETE</div>}
    </section>
  );
}

function HistoryChallenge({ frame }: { frame: Frame }) {
  const history = frame.challenge.history;
  if (!history) return null;

  const exposureProgress = history.phase === "exposure"
    ? Math.max(0, Math.min(1, (frame.t - history.exposure_started) / history.exposure_duration))
    : 1;
  const testProgress = history.phase === "test" && history.test_started != null
    ? Math.max(0, Math.min(1, (frame.t - history.test_started) / history.test_duration))
    : history.phase === "complete" ? 1 : 0;

  return (
    <div className="history-card">
      <div className="history-title">
        <span>RECENT HISTORY EXPERIMENT</span>
        <b>{history.phase.toUpperCase()}</b>
      </div>

      <div className="history-pair">
        <div><strong>A</strong><span>FOOD / ODOR HISTORY</span></div>
        <div><strong>B</strong><span>LOOM / THREAT HISTORY</span></div>
      </div>

      <div className="history-stage">
        <span>1 · EXPOSURE</span>
        <i><em style={{ width: `${exposureProgress * 100}%` }} /></i>
      </div>
      <div className="history-stage">
        <span>2 · SAME CUE-FREE TEST</span>
        <i><em style={{ width: `${testProgress * 100}%` }} /></i>
      </div>

      {history.phase !== "exposure" && (
        <div className="history-metrics">
          <div><span>NEURAL Δ NOW</span><b>{history.neural_now.toFixed(3)}</b></div>
          <div><span>SPACE Δ NOW</span><b>{history.spatial_now.toFixed(3)}</b></div>
          <div><span>MAX NEURAL Δ</span><b>{history.neural_max.toFixed(3)}</b></div>
          <div><span>MAX SPACE Δ</span><b>{history.spatial_max.toFixed(3)}</b></div>
        </div>
      )}

      {history.result && (
        <div className="history-result">
          <b>SAME WORLD · DIFFERENT RECENT PAST</b>
          <span>Mean neural divergence: {history.result.mean_neural_divergence.toFixed(3)}</span>
          <span>Max behavioral separation: {history.result.max_behavioral_divergence.toFixed(3)}</span>
        </div>
      )}

      <p className="microcopy">
        This tests whether different recent sensory histories leave different continuing neural states.
        It does <b>not</b> claim associative learning, long-term memory, or biological recall.
      </p>
    </div>
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
