import { useMemo, useState, type ReactNode } from "react";

type Entry = { title: string; body: ReactNode; tags?: string[] };
type Section = { id: string; eyebrow: string; title: string; intro: string; entries: Entry[] };

const sections: Section[] = [
  {
    id: "mental-model", eyebrow: "01 / MODEL", title: "What FLYBOX actually is",
    intro: "A closed-loop connectome sandbox with deliberately separated biological data, simulated dynamics, experimental interfaces, and game mechanics.",
    entries: [
      { title: "Closed loop", body: <p><code>WORLD → sensory encoder → FlyBrain → descending-neuron readout → body decoder → WORLD</code>. Every neural step is 20 ms by default.</p>, tags:["architecture","loop"] },
      { title: "Connectome scale", body: <p>The packaged FlyBrain graph contains <b>166,700 neurons</b> and roughly <b>25.6 million synapses</b>. Full graph propagation stays server-side.</p>, tags:["neurons","synapses"] },
      { title: "Scientific boundary", body: <p>FLYBOX does not claim a complete biological fly, exact natural behavior, cognition, consciousness, or a biologically complete sensory/motor system.</p>, tags:["limitations","claims"] },
      { title: "Truth labels", body: <p>Every important feature belongs to one of five categories: <b>CONNECTOME DATA</b>, <b>SIMULATED NEURAL DYNAMICS</b>, <b>EXPERIMENTAL ENCODER</b>, <b>EXPERIMENTAL DECODER</b>, or <b>GAME MECHANIC</b>.</p>, tags:["provenance"] },
    ],
  },
  {
    id: "controls", eyebrow: "02 / CONTROL", title: "Every direct control",
    intro: "The interaction layer is intentionally small: place, drag, delete, possess, pause, step, reset, rewind.",
    entries: [
      { title: "HAND / inspect", body: <p>Select an agent, drag an agent, or drag a placed world object without changing the chosen world tool.</p> },
      { title: "Left click", body: <p>With a placement tool selected, places that object at the clicked arena position.</p> },
      { title: "Right click", body: <p>Deletes the exact placed world object under the pointer. Empty-space right click is ignored.</p> },
      { title: "POSSESS", body: <p>WASD / arrow keys add manual body commands while the neural simulation continues to receive sensory input.</p> },
      { title: "PAUSE / PLAY", body: <p>Stops or resumes automatic stepping of the simulation.</p> },
      { title: "+20 ms", body: <p>Advances exactly one default neural simulation step.</p> },
      { title: "Speed", body: <p>Run at 0.05×, 0.25×, 1×, 2×, 5×, or 10× wall-clock pacing without changing the model timestep.</p> },
      { title: "RESET BOX", body: <p>Resets the current ephemeral simulation state from its seed.</p> },
      { title: "SAVE MOMENT", body: <p>On CPU/mock backends, captures an exact bounded checkpoint including neural state, RNG, traces, world, interventions, couplings, and challenge state.</p> },
      { title: "REWIND", body: <p>Restores a saved checkpoint inside the same ephemeral sandbox. Exact CUDA checkpointing is intentionally not claimed.</p> },
    ],
  },
  {
    id: "world", eyebrow: "03 / WORLD", title: "Everything you can put in the arena",
    intro: "World objects are game-space stimuli. Their neural encodings are explicit and inspectable.",
    entries: [
      { title: "FRUIT", body: <p>Edible object. Emits an experimental ORN_DM1/ORN_DM2 odor field. Feeding raises game energy and can consume the item.</p> },
      { title: "ODOR PAINT", body: <p>Non-edible olfactory field using the same ORN_DM1/ORN_DM2 pathway. Useful for separating smell from reward/feeding.</p> },
      { title: "TARGET", body: <p>Visual point of interest encoded into LC10a. PLAY can add target-seeking assist; PURE LAB removes that assist.</p> },
      { title: "LOOM", body: <p>Threat-like visual object. Angular growth drives LPLC2; close threat can additionally drive LC4.</p> },
      { title: "PREDATOR", body: <p>Draggable threat. PLAY prioritizes avoidance. Physical contact can catch/kill an embodied agent.</p> },
      { title: "SOUND", body: <p>Pulsing source mapped to available JO-A / JO-B auditory populations. PLAY adds only weak orientation.</p> },
      { title: "LIGHT", body: <p>Projects drive onto FlyBrain visual neurons using stored azimuth metadata. PLAY can add weak phototaxis-like orientation.</p> },
      { title: "WALL", body: <p>Solid obstacle. Nearby frontal approach can drive LPLC1; physical contact drives SNta touch. PLAY adds explicit pre-collision avoidance.</p> },
      { title: "GOAL", body: <p>Challenge destination that behaves like a target in PLAY and powers race/objective modes.</p> },
      { title: "WORLD randomize", body: <p>Creates a reproducible seeded mix of world elements.</p> },
      { title: "DAILY", body: <p>Creates the deterministic daily world preset.</p> },
      { title: "CLEAR", body: <p>Removes placed world objects from the current sandbox.</p> },
      { title: "Environment", body: <p>Daylight/night presentation and wind can be changed. Wind acts on embodied motion, not directly on the connectome.</p> },
    ],
  },
  {
    id: "play", eyebrow: "04 / PLAY", title: "PLAY behavior and game assists",
    intro: "PLAY is intentionally fun. Its body assists are visible and separately labeled so they cannot be mistaken for neural ground truth.",
    entries: [
      { title: "Reflex priority", body: <p><b>Touch → predator/loom → wall → arena edge → target/goal → food/odor → light/sound → search.</b> Stronger safety reflexes suppress lower-priority exploration.</p> },
      { title: "Forage steer", body: <p>Uses food/odor position and hunger to make the body approach stronger food cues.</p> },
      { title: "Threat avoid", body: <p>Turns away from predator/loom threats. This is a PLAY body command, separate from LC4/LPLC2 neural input.</p> },
      { title: "Wall avoid", body: <p>Turns away before collision; SNta touch is the fallback after physical contact.</p> },
      { title: "Edge reflex", body: <p>Steers inward near arena boundaries; boundary reflection prevents getting pinned to an edge.</p> },
      { title: "Target / goal", body: <p>Approaches targets and challenge goals so these objects have visible embodied meaning.</p> },
      { title: "Orient", body: <p>Light and sound receive weaker orientation so they do not dominate threats, walls, or food.</p> },
      { title: "Search wobble", body: <p>Deterministic exploratory turning used when no strong cue is present.</p> },
      { title: "PURE LAB", body: <p>Disables all PLAY locomotion/foraging assists. Movement is then only named neural readout + the explicit engineering body decoder.</p> },
    ],
  },
  {
    id: "neural-input", eyebrow: "05 / INPUT", title: "Sensory encoders",
    intro: "These mappings convert sandbox state into neural drive. They are experimental interfaces around the connectome, not complete sensory transduction models.",
    entries: [
      { title: "Fruit / odor → ORN_DM1 + ORN_DM2", body: <p>Concentration-like field scaled by sensory gain and hunger-related gain.</p> },
      { title: "Target / goal → LC10a", body: <p>Side-aware visual target injection selected from world-space bearing.</p> },
      { title: "Loom → LPLC2", body: <p>Drive depends on apparent angular size and growth.</p> },
      { title: "Close threat → LC4", body: <p>Additional threat signal increases at close distance.</p> },
      { title: "Wall ahead → LPLC1", body: <p>Experimental approach/small-object signal for frontal obstacles.</p> },
      { title: "Touch → SNta", body: <p>Left/right tactile population chosen from contact side.</p> },
      { title: "Sound → JO-A / JO-B", body: <p>Available auditory cell types are discovered from FlyBrain cell metadata.</p> },
      { title: "Light → visual neurons", body: <p>Drive is placed spatially using stored azimuth metadata rather than a single named population.</p> },
      { title: "Sensory gain", body: <p>Scales sandbox sensory injections for the selected agent. It does not rewrite the connectome.</p> },
    ],
  },
  {
    id: "neural-output", eyebrow: "06 / OUTPUT", title: "Motor and descending-neuron readouts",
    intro: "Named neural populations are measured, then an explicit engineering decoder maps those measurements into body movement.",
    entries: [
      { title: "DNg100", body: <p>Forward-drive readout. Smoothed firing rate contributes to neural forward speed.</p> },
      { title: "DNa02 L/R", body: <p>Left-right firing-rate difference contributes to steering.</p> },
      { title: "DNp01", body: <p>Strong activity contributes to an escape boost.</p> },
      { title: "MDN", body: <p>Backward/reverse component.</p> },
      { title: "descending_neuron trace", body: <p>Aggregate trace over the broader descending-neuron population for inspection and experiments.</p> },
      { title: "Engineering decoder", body: <p>Movement is not presented as a complete validated fly motor model. Decoder outputs and PLAY assists remain separately visible.</p> },
    ],
  },
  {
    id: "brain-view", eyebrow: "07 / ANATOMY", title: "Live 3D brain viewer",
    intro: "The viewer is for spatial inspection of simulated activity, not decorative fake anatomy.",
    entries: [
      { title: "3D soma anatomy", body: <p>Uses real normalized MaleCNS x/y/z soma coordinates exposed by FlyBrain when available.</p> },
      { title: "Live spikes", body: <p>Current simulated firing neurons are overlaid at their mapped 3D soma positions. Frames carry a bounded activity sample rather than the full graph.</p> },
      { title: "Camera", body: <p>Drag to rotate in 3D, wheel to zoom, switch to TOP or SIDE orthographic projections, or reset the camera.</p> },
      { title: "What is not shown yet", body: <p>Full neurite skeletons, synaptic boutons, and all 25.6M graph edges are not streamed to the browser. Those require a separate morphology/LOD pipeline.</p> },
      { title: "Unavailable anatomy", body: <p>If coordinate metadata is unavailable or mock mode is active, the UI says so instead of synthesizing fake positions.</p> },
    ],
  },
  {
    id: "lab", eyebrow: "08 / LAB", title: "Laboratory tools",
    intro: "LAB exposes the simulation state and controlled interventions.",
    entries: [
      { title: "Live firing metrics", body: <p>Fired neuron count, firing fraction, newly firing count, firing-set Jaccard distance, DN activity, and DN fired count.</p> },
      { title: "Population table", body: <p>Shows named population size, current firing count, and whether a population is silenced.</p> },
      { title: "Stimulate population", body: <p>Queues a one-step voltage injection into a selected named population.</p> },
      { title: "Silence population", body: <p>Filters that population from the firing set so the intervention changes subsequent recurrent dynamics.</p> },
      { title: "Restore population", body: <p>Removes an active population-silencing intervention.</p> },
      { title: "Random synapse lesion", body: <p>Applies a deterministic seeded lesion to a fraction of graph weights and records the intervention.</p> },
      { title: "A/B divergence", body: <p>For multiple agents, compares firing-set Jaccard divergence, physical separation, and energy difference live.</p> },
      { title: "Batch probe", body: <p>Runs multiple real FlyBrain neural states over one shared connectome graph with a chosen named-population stimulation and reports firing/DN summaries.</p> },
      { title: "Experiment export", body: <p>Downloads explicit JSON containing configuration, world, agents, trajectories, interventions, events, challenge state, and couplings.</p> },
    ],
  },
  {
    id: "agents", eyebrow: "09 / AGENTS", title: "Agents, bodies, forks, and comparison",
    intro: "A FLYBOX agent is a full neural state plus embodiment/game state.",
    entries: [
      { title: "Spawn", body: <p>Adds another independent full FlyBrain agent up to the configured cap.</p> },
      { title: "Rename", body: <p>Changes display name only.</p> },
      { title: "Remove", body: <p>Non-primary agents can be deleted from the current sandbox.</p> },
      { title: "Bodies", body: <p>FLY, CAR, BOT, DRONE, WALKER, SHIP, and stationary SYNTH. Body speed/motion semantics are intentionally artificial.</p> },
      { title: "Fork brain", body: <p>Where exact copying is supported, creates another agent from the same neural and game state, including membrane state, firing, RNG, traces, interventions, and encoder/motor history.</p> },
      { title: "CPU/mock guarantee", body: <p>Exact state fork/checkpoint is supported for CPU/mock paths. Exact CUDA copying is not claimed until validated.</p> },
    ],
  },
  {
    id: "challenges", eyebrow: "10 / CHALLENGES", title: "Structured experiments and games",
    intro: "Challenges reuse the same simulation rather than substituting a separate game engine.",
    entries: [
      { title: "Snack Attack", body: <p>Consume food items.</p> },
      { title: "Don't Get Squished", body: <p>Keep an agent alive against a predator.</p> },
      { title: "You vs Fly", body: <p>User manipulates the predator while the fly attempts to survive.</p> },
      { title: "Fly Race", body: <p>Multiple agents race toward a goal.</p> },
      { title: "Brain Car", body: <p>Embodies the connectome in the faster CAR body and races it.</p> },
      { title: "Maze Run", body: <p>Combines obstacles with a destination/food objective.</p> },
      { title: "Mutation Tournament", body: <p>Competes explicitly modified rivals such as LC4-OFF or a seeded lesion; modifications are real interventions, not labels.</p> },
      { title: "Connectome Hijack", body: <p>Use a limited stimulation budget to reach a descending-neuron activity target.</p> },
      { title: "Mystery Brain", body: <p>One agent receives a hidden reproducible intervention. Experiment first, then reveal it.</p> },
      { title: "Recent History", body: <p>Creates an exact matched fork, gives A food/odor history and B loom/threat history, removes cues, then compares continuing neural/behavioral divergence. It tests short-term state/history dependence, not learned biological memory.</p> },
      { title: "Sandbox", body: <p>No objective: construct worlds and manipulate the connectome freely.</p> },
    ],
  },
  {
    id: "weird", eyebrow: "11 / WEIRD", title: "Experimental toys",
    intro: "These features deliberately push the connectome into artificial situations while keeping the artificiality explicit.",
    entries: [
      { title: "Neural Fireworks", body: <p>Visual overlay derived from bounded recent firing samples.</p> },
      { title: "Brain Tone", body: <p>Sonifies neural/motor readouts with an oscillator. It is not biological fly audio.</p> },
      { title: "Brain → Brain", body: <p>Artificially injects scaled previous DN activity from one agent into a named population of another. Explicitly labeled experimental artificial coupling.</p> },
      { title: "Chaos Button", body: <p>Applies a reproducible seeded synapse lesion.</p> },
      { title: "Cinema Mode", body: <p>Hides lab chrome and shows the embodied world full-screen.</p> },
      { title: "Achievements", body: <p>Local ephemeral milestones such as FIRST BITE, ESCAPE ARTIST, BRAIN SURGEON, CHAOS THEORY, PARTY BOX, and SURVIVOR.</p> },
    ],
  },
  {
    id: "developer", eyebrow: "12 / DEVELOPER", title: "Console, API, SDK, and protocol",
    intro: "The browser UI is one client. The simulation can also be driven through its API and small SDKs.",
    entries: [
      { title: "Console", body: <><p>Built-in commands include:</p><pre>{`stim LC4 0.8
silence LC10a
restore LC10a
spawn food .5 .5
fork
random 42
challenge race`}</pre></> },
      { title: "Simulation operations", body: <p>pause, resume, single-step, reset, and speed selection.</p> },
      { title: "Agent operations", body: <p>spawn, remove, rename, body, controller, move, manual drive, fork, sensory gain, interventions.</p> },
      { title: "World operations", body: <p>add, move, remove, clear, randomize, daily preset, environment controls.</p> },
      { title: "Experiment operations", body: <p>challenge start/reveal, checkpoint, rewind, JSON export/import, population status, brain sample, batch probe.</p> },
      { title: "WebSocket ownership", body: <p>The browser's stateful commands travel over the same WebSocket that owns its temporary sandbox so requests remain pinned to one live runtime.</p> },
      { title: "Stateless HTTP", body: <p>The isolated batch probe can run over ordinary HTTP because it is intentionally separate from the live sandbox state.</p> },
      { title: "SDKs", body: <p><code>sdk/python/flybox.py</code>, <code>sdk/js/flybox.ts</code>, plus example scripts such as <code>examples/hijack.py</code>.</p> },
    ],
  },
  {
    id: "sessions", eyebrow: "13 / STATE", title: "Ephemeral session model",
    intro: "FLYBOX deliberately behaves more like a disposable physics sandbox than an account-based product.",
    entries: [
      { title: "One page, one sandbox", body: <p>Opening the sandbox creates a temporary in-memory simulation owned by that browser page.</p> },
      { title: "Separate tabs", body: <p>A second tab gets a different sandbox. Visitors do not share worlds.</p> },
      { title: "No automatic persistence", body: <p>There are no user accounts, saved profiles, cookies for world state, or automatic restore.</p> },
      { title: "Disconnect cleanup", body: <p>Leaving sends a best-effort close; disconnected sessions are destroyed after a short grace period.</p> },
      { title: "Explicit export", body: <p>JSON leaves the sandbox only when the user explicitly exports it.</p> },
    ],
  },
  {
    id: "performance", eyebrow: "14 / SCALE", title: "Performance and resource rules",
    intro: "The graph is too large to treat like a normal browser visualization.",
    entries: [
      { title: "Agent cap", body: <p>Each real agent owns a full neural state over 166,700 neurons, so simultaneous full-agent count is intentionally limited.</p> },
      { title: "No 25M-edge browser payload", body: <p>The full synapse graph is never streamed to the frontend.</p> },
      { title: "Bounded frames", body: <p>WebSocket frames contain compact metrics and bounded firing/anatomy samples.</p> },
      { title: "Bounded logs/world state", body: <p>Trajectories, logs, odor objects, and other UI-facing data structures are bounded.</p> },
      { title: "Native propagation", body: <p>FlyBrain performs graph propagation; FLYBOX avoids Python loops over every synapse per UI frame.</p> },
    ],
  },
  {
    id: "extend", eyebrow: "15 / EXTEND", title: "What we can add next",
    intro: "These extensions fit the current architecture without changing the project's scientific honesty.",
    entries: [
      { title: "Full neuron morphologies", body: <p>Load MaleCNS/FlyWire SWC or precomputed centerlines on demand, map them to simulator neuron IDs, and render selected/active neurites with level-of-detail.</p> },
      { title: "Circuit isolation", body: <p>Select a sensory or motor population and show only its active neighborhood, strongest paths, and temporal propagation.</p> },
      { title: "Activity recorder", body: <p>Record selected populations across time, scrub a timeline, compare trials, and export CSV/NPZ alongside experiment metadata.</p> },
      { title: "Protocol builder", body: <p>Declarative sequences such as baseline → stimulus → washout → intervention → repeat, with deterministic seeds and automatic trial comparison.</p> },
      { title: "Population explorer", body: <p>Search all cell types, sides, counts, firing, anatomy, and intervention status instead of only the current curated populations.</p> },
      { title: "Graph query tools", body: <p>Server-side shortest paths, upstream/downstream neighborhoods, weighted connectivity, and cell-type summaries without shipping the entire graph.</p> },
      { title: "Reproducible experiment links", body: <p>Encode non-personal experiment configuration into a shareable URL or small static manifest while keeping live state ephemeral.</p> },
      { title: "Scientific notebooks", body: <p>Export experiment bundles that can be loaded directly into Python/Jupyter for statistics and plotting.</p> },
      { title: "Validation suite", body: <p>Formalize behavioral/neural benchmark scenarios so future encoder/decoder changes can be compared quantitatively.</p> },
    ],
  },
];

function Card({ entry }: { entry: Entry }) {
  return <article className="docs-card"><h3>{entry.title}</h3><div>{entry.body}</div></article>;
}

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => sections.map((section) => {
    if (!q) return section;
    const sectionHit = (section.title + " " + section.intro + " " + section.eyebrow).toLowerCase().includes(q);
    const entries = section.entries.filter((entry) =>
      sectionHit || (entry.title + " " + (entry.tags ?? []).join(" ")).toLowerCase().includes(q)
    );
    return { ...section, entries };
  }).filter((section) => section.entries.length), [q]);

  return (
    <main className="docs-page">
      <header className="docs-topbar">
        <a href="/" className="docs-brand">FLYBOX</a>
        <span className="docs-slash">/</span><b>DOCS</b>
        <div className="docs-top-actions">
          <a href="https://github.com/gauravvvvvvvvvv/flybox" target="_blank" rel="noreferrer">GITHUB</a>
          <a className="docs-open" href="/">OPEN SANDBOX</a>
        </div>
      </header>

      <div className="docs-shell">
        <aside className="docs-sidebar">
          <label className="docs-search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documentation" /></label>
          <nav>
            {sections.map((s) => <a key={s.id} href={`#${s.id}`}><small>{s.eyebrow.split(" / ")[0]}</small>{s.title}</a>)}
          </nav>
          <div className="docs-sidebar-note"><b>SCIENTIFIC RULE</b><p>Make it fun without hiding what is real, simulated, experimental, or invented.</p></div>
        </aside>

        <article className="docs-content">
          <section className="docs-hero">
            <div className="eyebrow">FLYBOX TECHNICAL REFERENCE</div>
            <h1>The complete manual for<br/><span>the brain in the box.</span></h1>
            <p>Controls, connectome interfaces, anatomy, experiments, challenge logic, APIs, provenance, limitations, and extension points — documented for users, developers, and neuroscientists.</p>
            <div className="docs-facts">
              <div><strong>166,700</strong><span>NEURONS</span></div>
              <div><strong>25.6M</strong><span>SYNAPSES</span></div>
              <div><strong>20 ms</strong><span>DEFAULT STEP</span></div>
              <div><strong>5</strong><span>PROVENANCE CLASSES</span></div>
            </div>
          </section>

          {q && <div className="docs-results">{filtered.length ? `Showing documentation matching “${query}”` : `No documentation matches “${query}”`}</div>}

          {filtered.map((section) => (
            <section className="docs-section" id={section.id} key={section.id}>
              <div className="docs-section-intro">
                <span>{section.eyebrow}</span><h2>{section.title}</h2><p>{section.intro}</p>
              </div>
              <div className="docs-card-grid">{section.entries.map((entry) => <Card key={entry.title} entry={entry} />)}</div>
            </section>
          ))}

          <footer className="docs-footer">
            <b>FLYBOX</b><p>Source of truth in the repository: <code>docs/FLYBOX.md</code>. This page is the human-readable web reference.</p>
            <a href="/">OPEN THE SANDBOX →</a>
          </footer>
        </article>
      </div>
    </main>
  );
}
