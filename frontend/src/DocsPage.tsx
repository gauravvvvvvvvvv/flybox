import type { ReactNode } from "react";

type DocPage = {
  path: string;
  group: string;
  title: string;
  description: string;
  body: ReactNode;
};

const Code = ({ children }: { children: string }) => <pre className="docs-code"><code>{children}</code></pre>;
const Note = ({ title, children }: { title: string; children: ReactNode }) => <aside className="docs-note"><b>{title}</b><div>{children}</div></aside>;

const pages: DocPage[] = [
  {
    path: "", group: "GET STARTED", title: "Introduction",
    description: "What FLYBOX is, what it simulates, and how to think about the system.",
    body: <>
      <h2>What is FLYBOX?</h2>
      <p>FLYBOX is an interactive laboratory built around a simplified fruit-fly connectome simulation. It places a FlyBrain neural model inside a small closed-loop world where environmental events can be encoded into neural input, the network advances through time, selected neural activity is decoded into body commands, and the resulting body movement changes the next sensory state.</p>
      <Code>{`WORLD
  ↓
experimental sensory encoder
  ↓
FlyBrain connectome simulation
  ↓
descending-neuron readout
  ↓
experimental body decoder
  ↓
WORLD`}</Code>
      <p>The production graph contains <strong>166,700 neurons</strong> and roughly <strong>25.6 million synapses</strong>. The default neural timestep is <strong>20 ms</strong>.</p>
      <Note title="Scientific scope"><p>FLYBOX does not claim to reproduce a complete biological fly, cognition, consciousness, exact wild-fly behavior, or a complete sensory/motor system. The interface intentionally distinguishes connectome data, simulated dynamics, experimental mappings, and game mechanics.</p></Note>
      <h2>Who is this documentation for?</h2>
      <p>The documentation is written for three audiences: people exploring FLYBOX as a sandbox, developers extending or integrating it, and neuroscientists who need to know exactly which signals come from the connectome and which are engineering layers around it.</p>
      <h2>Core design rule</h2>
      <blockquote>Make it fun without hiding what is real, simulated, experimental, or invented.</blockquote>
    </>
  },
  {
    path: "getting-started/quickstart", group: "GET STARTED", title: "Quickstart",
    description: "Run your first closed-loop experiment in a few minutes.",
    body: <>
      <h2>1. Open a sandbox</h2><p>Open FLYBOX and enter the sandbox. Each browser page receives a new temporary in-memory simulation.</p>
      <h2>2. Switch to LAB when you want clean interpretation</h2><p>PLAY contains explicit body assists that make the sandbox more lively. PURE LAB removes those assists and leaves movement to the named neural readouts plus the engineering motor decoder.</p>
      <h2>3. Add a looming stimulus</h2><p>Select <strong>LOOM</strong> and place it near PRIME. The world encoder uses apparent angular growth to drive LPLC2, with an additional LC4 threat signal at close range.</p>
      <h2>4. Inspect the brain</h2><p>Open LAB and inspect firing count, descending-neuron activity, population status, and the 3D soma viewer. Currently firing mapped neurons glow at their real normalized MaleCNS soma positions.</p>
      <h2>5. Intervene</h2><p>Select a named population such as LC4 and stimulate, silence, or restore it. Every intervention is explicit and recorded in the session.</p>
      <h2>6. Export the experiment</h2><p>Use JSON export to save world configuration, agent configuration, trajectories, interventions, events, challenge state, and couplings.</p>
    </>
  },
  {
    path: "concepts/architecture", group: "CONCEPTS", title: "System architecture",
    description: "How the browser, simulation engine, FlyBrain model, and WebSocket session fit together.",
    body: <>
      <h2>Runtime architecture</h2>
      <Code>{`React / Vite client
    ↕ WebSocket
FastAPI session runtime
    ↓
SimulationEngine
    ├─ World
    ├─ FlyAgent
    │   ├─ SensoryEncoder
    │   ├─ FlyBrain
    │   ├─ MotorDecoder
    │   └─ InterventionManager
    └─ challenges / checkpoints / couplings`}</Code>
      <h2>Ephemeral sessions</h2><p>The live browser sandbox is owned by one WebSocket connection. Stateful browser commands travel over that same socket so the simulation remains pinned to the same server runtime. A second tab receives a different sandbox.</p>
      <h2>Why the whole graph stays server-side</h2><p>The 25.6M-edge connectome is not a reasonable browser payload. The server performs graph propagation and emits compact frame data, bounded firing samples, metrics, and bounded anatomy samples.</p>
      <h2>Stateless operations</h2><p>The batch probe is computationally isolated from the live sandbox and can use ordinary HTTP.</p>
    </>
  },
  {
    path: "concepts/simulation", group: "CONCEPTS", title: "Simulation model",
    description: "Neural timestep, state, recurrent propagation, and what a FlyBrain agent owns.",
    body: <>
      <h2>Neural dynamics</h2><p>FLYBOX uses FlyBrain's simplified leaky integrate-and-fire simulation. Each neural step advances the recurrent network state and produces a set of firing neuron indices.</p>
      <h2>Agent state</h2><p>A full agent owns neural membrane state, firing state, RNG state, descending-neuron traces, encoder history, motor smoothing, intervention state, body state, trajectory, energy, and world position.</p>
      <h2>Time</h2><p>The default simulation timestep is 20 ms. Speed controls change wall-clock pacing, not the timestep itself.</p>
      <h2>Forking</h2><p>On CPU/mock backends, FLYBOX can clone the complete validated runtime state for controlled divergence experiments. Exact CUDA cloning is deliberately not claimed.</p>
    </>
  },
  {
    path: "neuroscience/connectome", group: "NEUROSCIENCE", title: "Connectome data",
    description: "What anatomical and graph information FLYBOX receives from FlyBrain/MaleCNS.",
    body: <>
      <h2>Graph</h2><p>The model exposes 166,700 neurons and approximately 25.6 million weighted synapses. Cell metadata includes named cell types and, where available, left/right side labels.</p>
      <h2>Anatomy</h2><p>When available, FLYBOX uses MaleCNS soma coordinates. The current 3D viewer renders normalized x/y/z soma positions directly.</p>
      <h2>Named populations</h2><p>FLYBOX currently exposes a curated set including LC4, LPLC2, LPLC1, LC10a, LC6, LC16, LC15, ORN_DM1, ORN_DM2, SNta, DNg100, DNa02, DNp01, MDN, and descending_neuron.</p>
      <Note title="Anatomy is not dynamics"><p>The connectome and soma coordinates are structural data. Firing activity shown in FLYBOX is produced by the simulator, not an in-vivo recording of the same fly.</p></Note>
    </>
  },
  {
    path: "neuroscience/sensory-encoders", group: "NEUROSCIENCE", title: "Sensory encoders",
    description: "How objects in the sandbox are converted into neural input.",
    body: <>
      <h2>Overview</h2><p>The sandbox world does not directly exist inside FlyBrain. FLYBOX therefore defines explicit experimental encoders that convert world state into voltage drive for documented neural populations.</p>
      <table className="docs-reference-table"><thead><tr><th>World input</th><th>Neural input</th><th>Role</th></tr></thead><tbody>
        <tr><td>Fruit / odor</td><td>ORN_DM1 + ORN_DM2</td><td>olfactory field</td></tr>
        <tr><td>Target / goal</td><td>LC10a</td><td>visual target</td></tr>
        <tr><td>Loom</td><td>LPLC2</td><td>angular-growth signal</td></tr>
        <tr><td>Close threat</td><td>LC4</td><td>proximity threat</td></tr>
        <tr><td>Wall ahead</td><td>LPLC1</td><td>approach / small object</td></tr>
        <tr><td>Touch</td><td>SNta</td><td>left/right tactile input</td></tr>
        <tr><td>Sound</td><td>JO-A / JO-B</td><td>auditory drive</td></tr>
        <tr><td>Light</td><td>visual neurons + azimuth</td><td>spatial light drive</td></tr>
      </tbody></table>
      <h2>Sensory gain</h2><p>The selected agent has a sensory-gain control that scales sandbox sensory injections without modifying the connectome graph.</p>
      <Note title="Experimental encoder"><p>These mappings are interfaces for experiments. They are not claims of complete biological transduction.</p></Note>
    </>
  },
  {
    path: "neuroscience/motor-decoder", group: "NEUROSCIENCE", title: "Motor decoder",
    description: "How descending-neuron activity is converted into body movement.",
    body: <>
      <h2>Named readouts</h2>
      <table className="docs-reference-table"><thead><tr><th>Role</th><th>Population</th><th>Use</th></tr></thead><tbody>
        <tr><td>Forward</td><td>DNg100</td><td>forward speed contribution</td></tr>
        <tr><td>Steering</td><td>DNa02 L/R</td><td>left/right differential steering</td></tr>
        <tr><td>Escape</td><td>DNp01</td><td>escape boost</td></tr>
        <tr><td>Backward</td><td>MDN</td><td>reverse component</td></tr>
      </tbody></table>
      <h2>Engineering layer</h2><p>The named neural signals are real simulator outputs. Their mapping into game-space turn and speed is an explicit engineering decoder.</p>
      <h2>PLAY vs PURE LAB</h2><p>PURE LAB uses the neural decoder without PLAY's extra locomotion, foraging, wall, edge, or orientation helpers. PLAY overlays those helpers and displays them separately.</p>
    </>
  },
  {
    path: "neuroscience/brain-viewer", group: "NEUROSCIENCE", title: "3D brain viewer",
    description: "How anatomical coordinates and live simulated activity are rendered.",
    body: <>
      <h2>Structural layer</h2><p>The viewer receives a bounded sample of real MaleCNS x/y/z soma coordinates. The SOMA layer renders that anatomy in 3D.</p>
      <h2>Activity layer</h2><p>The live frame carries a bounded set of currently firing neurons with mapped soma coordinates. The SPIKES layer highlights those neurons.</p>
      <h2>Viewer controls</h2><p>Use 3D, TOP, and SIDE views; drag to rotate; use the wheel to zoom; toggle SOMA, SPIKES, and GRID; or expand the inspector.</p>
      <h2>What is not rendered</h2><p>The browser does not currently load complete axon/dendrite centerlines or 25.6M synaptic edges. Those require a morphology loader and level-of-detail pipeline.</p>
    </>
  },
  {
    path: "guides/experiments", group: "GUIDES", title: "Designing experiments",
    description: "How to create controlled, reproducible experiments in FLYBOX.",
    body: <>
      <h2>Start from a controlled state</h2><p>Record the world seed, controller mode, body type, sensory gain, and intervention state. Use checkpoints or exact CPU forks when matched initial conditions matter.</p>
      <h2>Change one factor</h2><p>Examples include stimulus location, sensory gain, one population intervention, one synapse lesion seed, or one recent sensory history.</p>
      <h2>Measure neural and embodied outcomes separately</h2><p>Neural measures include firing count, firing-set Jaccard distance, named population firing, and DN traces. Embodied measures include trajectory separation, energy, escape events, and challenge outcome.</p>
      <h2>Export everything</h2><p>Use experiment JSON export and preserve seed/intervention metadata with any downstream plots or statistical analysis.</p>
    </>
  },
  {
    path: "guides/interventions", group: "GUIDES", title: "Neural interventions",
    description: "Stimulate, silence, restore, and lesion the simulated network.",
    body: <>
      <h2>Stimulate</h2><p>Queues voltage injection into the selected named population.</p>
      <Code>{`stim LC4 0.8`}</Code>
      <h2>Silence</h2><p>Removes the selected population from the firing set so the intervention affects subsequent recurrent propagation.</p>
      <Code>{`silence LC10a`}</Code>
      <h2>Restore</h2><p>Removes an active silencing intervention.</p>
      <Code>{`restore LC10a`}</Code>
      <h2>Seeded lesion</h2><p>A random synapse lesion modifies a reproducibly selected fraction of graph weights. It is a computational intervention, not a biological injury model.</p>
    </>
  },
  {
    path: "guides/recent-history", group: "GUIDES", title: "Recent History experiment",
    description: "Test short-term neural state dependence without claiming learned memory.",
    body: <>
      <h2>Question</h2><p>Do two identical simulated neural states diverge after receiving different recent sensory histories, even when they are subsequently placed in the same neutral conditions?</p>
      <h2>Protocol</h2>
      <ol><li>Create an exact matched CPU/mock fork.</li><li>Expose A to food/odor history.</li><li>Expose B to loom/threat history.</li><li>Remove all cues.</li><li>Restore identical body/controller conditions.</li><li>Compare neural Jaccard divergence and physical trajectory separation.</li></ol>
      <Note title="Interpretation"><p>This demonstrates short-term state/history dependence in the simulation. It does not establish biological learning, associative memory, or long-term plasticity.</p></Note>
    </>
  },
  {
    path: "reference/world", group: "REFERENCE", title: "World objects",
    description: "Reference for every object that can exist in the sandbox.",
    body: <>
      <table className="docs-reference-table"><thead><tr><th>Object</th><th>Purpose</th><th>Neural relation</th></tr></thead><tbody>
        <tr><td>FRUIT</td><td>edible odor source</td><td>ORN_DM1/ORN_DM2</td></tr>
        <tr><td>ODOR</td><td>non-edible smell</td><td>ORN_DM1/ORN_DM2</td></tr>
        <tr><td>TARGET</td><td>visual point of interest</td><td>LC10a</td></tr>
        <tr><td>LOOM</td><td>approaching threat</td><td>LPLC2 + close LC4</td></tr>
        <tr><td>PREDATOR</td><td>physical threat</td><td>threat encoder + game collision</td></tr>
        <tr><td>SOUND</td><td>auditory source</td><td>JO-A / JO-B</td></tr>
        <tr><td>LIGHT</td><td>spatial visual drive</td><td>visual azimuth mapping</td></tr>
        <tr><td>WALL</td><td>solid obstacle</td><td>LPLC1 approach + SNta touch</td></tr>
        <tr><td>GOAL</td><td>challenge destination</td><td>LC10a target-like encoding</td></tr>
      </tbody></table>
    </>
  },
  {
    path: "reference/api", group: "REFERENCE", title: "API reference",
    description: "The supported operations exposed by the live sandbox protocol.",
    body: <>
      <h2>Transport</h2><p>Most stateful browser operations are RPC messages sent over the live sandbox WebSocket. Paths mirror HTTP-style endpoints.</p>
      <h3>Simulation</h3><Code>{`POST /api/simulation/pause
POST /api/simulation/resume
POST /api/simulation/step
POST /api/simulation/reset
POST /api/simulation/speed/{value}`}</Code>
      <h3>Agents</h3><Code>{`POST   /api/flies
DELETE /api/flies/{id}
POST   /api/flies/{id}/fork
POST   /api/flies/{id}/rename
POST   /api/flies/{id}/body/{body}
POST   /api/flies/{id}/controller/{controller}
POST   /api/flies/{id}/move
POST   /api/flies/{id}/drive
POST   /api/flies/{id}/interventions
POST   /api/flies/{id}/sensory-gain/{gain}`}</Code>
      <h3>World</h3><Code>{`POST   /api/world
DELETE /api/world
DELETE /api/world/{id}
POST   /api/world/{id}/move
POST   /api/world/randomize
POST   /api/world/daily
POST   /api/world/environment`}</Code>
      <h3>Inspection and experiments</h3><Code>{`GET  /api/brain/{id}/sample
GET  /api/populations/{id}
GET  /api/experiments/export
POST /api/experiments/import
POST /api/time/checkpoint
POST /api/time/rewind
POST /api/couplings
POST /api/challenges/{id}`}</Code>
    </>
  },
  {
    path: "reference/sdk", group: "REFERENCE", title: "SDKs and console",
    description: "Programmatic entry points for Python, JavaScript, and the built-in command console.",
    body: <>
      <h2>Included SDKs</h2><Code>{`sdk/python/flybox.py
sdk/js/flybox.ts
examples/hijack.py`}</Code>
      <h2>Console commands</h2><Code>{`stim LC4 0.8
silence LC10a
restore LC10a
spawn food .5 .5
fork
random 42
challenge race`}</Code>
      <p>The SDK and console are thin control surfaces over the same simulation capabilities used by the UI.</p>
    </>
  },
  {
    path: "reference/provenance", group: "REFERENCE", title: "Provenance labels",
    description: "How to interpret every class of signal in FLYBOX.",
    body: <>
      <h2>CONNECTOME DATA</h2><p>Graph weights, cell types, side metadata, named populations, and anatomy coordinates.</p>
      <h2>SIMULATED NEURAL DYNAMICS</h2><p>Spikes, firing sets, traces, and state produced by FlyBrain.</p>
      <h2>EXPERIMENTAL ENCODER</h2><p>Mappings from world state to neural injections.</p>
      <h2>EXPERIMENTAL DECODER</h2><p>Mappings from neural readout to body motion.</p>
      <h2>GAME MECHANIC</h2><p>Energy, hunger, PLAY assists, feeding, wind, bodies, achievements, and challenge scoring.</p>
    </>
  },
  {
    path: "reference/limitations", group: "REFERENCE", title: "Scientific limitations",
    description: "Claims FLYBOX intentionally does not make.",
    body: <>
      <p>FLYBOX does not claim:</p>
      <ul><li>a complete biological fly simulation</li><li>exact natural fly behavior</li><li>a complete visual, auditory, tactile, or olfactory system</li><li>ground-truth motor decoding</li><li>consciousness or cognition</li><li>biological intent</li><li>natural brain-to-brain communication</li><li>biological meaning for artificial body swaps</li><li>biological equivalence of game energy/hunger</li></ul>
      <p>The model itself also uses calibrated simulation parameters rather than direct recordings for every dynamic quantity.</p>
    </>
  },
  {
    path: "development/extending", group: "DEVELOPMENT", title: "Extending FLYBOX",
    description: "Where new functionality belongs and how to preserve scientific provenance.",
    body: <>
      <h2>Add a world stimulus</h2><p>Extend the world model, then add an explicit sensory encoder. Keep game-space behavior separate from neural input.</p>
      <h2>Add a neural readout</h2><p>Select a documented cell type or population and add a measurement before deciding whether it should affect embodiment.</p>
      <h2>Add a new experiment</h2><p>Prefer deterministic seeds, exact forks/checkpoints where supported, explicit interventions, bounded measurements, and exportable metadata.</p>
      <h2>Add morphology</h2><p>Use a separate morphology loader and LOD layer rather than shipping the full anatomy for every neuron in every frame.</p>
      <h2>Potential extensions</h2><ul><li>full neuron skeletons</li><li>circuit isolation</li><li>population explorer</li><li>activity recorder</li><li>protocol builder</li><li>server-side graph queries</li><li>Jupyter experiment bundles</li><li>benchmark/validation suite</li></ul>
    </>
  },
  {
    path: "development/repository", group: "DEVELOPMENT", title: "Repository structure",
    description: "Where the major subsystems live in the codebase.",
    body: <>
      <Code>{`flybox/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── simulation/
│   │       ├── engine.py
│   │       ├── fly.py
│   │       ├── mappings.py
│   │       ├── interventions.py
│   │       ├── world.py
│   │       └── challenges.py
│   └── tests/
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── Arena.tsx
│       ├── BrainView.tsx
│       ├── DocsPage.tsx
│       └── api.ts
├── sdk/
├── examples/
└── docs/FLYBOX.md`}</Code>
    </>
  },
];

const groups = ["GET STARTED","CONCEPTS","NEUROSCIENCE","GUIDES","REFERENCE","DEVELOPMENT"];

function normalizePath() {
  let path = window.location.pathname;
  if (path.startsWith("/help")) path = path.replace(/^\/help/, "/docs");
  path = path.replace(/^\/docs\/?/, "").replace(/\/$/, "");
  return path;
}

export default function DocsPage() {
  const currentPath = normalizePath();
  const page = pages.find((item) => item.path === currentPath) ?? pages[0];
  const currentIndex = pages.indexOf(page);
  const prev = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const next = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;

  return <main className="techdocs">
    <header className="techdocs-header">
      <a className="techdocs-logo" href="/">FLYBOX</a>
      <span>DOCS</span>
      <nav><a href="/docs">Documentation</a><a href="https://github.com/gauravvvvvvvvvv/flybox" target="_blank" rel="noreferrer">GitHub</a><a className="techdocs-launch" href="/">Open sandbox</a></nav>
    </header>

    <div className="techdocs-layout">
      <aside className="techdocs-nav">
        <div className="techdocs-version">FLYBOX <b>v0.2</b></div>
        {groups.map((group) => <section key={group}>
          <h4>{group}</h4>
          {pages.filter((p) => p.group === group).map((p) =>
            <a className={p.path === page.path ? "active" : ""} key={p.path} href={p.path ? `/docs/${p.path}` : "/docs"}>{p.title}</a>
          )}
        </section>)}
      </aside>

      <article className="techdocs-article">
        <div className="techdocs-breadcrumb">FLYBOX / {page.group} / <b>{page.title}</b></div>
        <h1>{page.title}</h1>
        <p className="techdocs-description">{page.description}</p>
        <div className="techdocs-body">{page.body}</div>

        <div className="techdocs-pager">
          {prev ? <a href={prev.path ? `/docs/${prev.path}` : "/docs"}><span>Previous</span><b>← {prev.title}</b></a> : <span />}
          {next ? <a className="next" href={`/docs/${next.path}`}><span>Next</span><b>{next.title} →</b></a> : <span />}
        </div>
      </article>

      <aside className="techdocs-meta">
        <b>ON THIS PAGE</b>
        <p>{page.title}</p>
        <hr/>
        <span>Source</span><code>docs/FLYBOX.md</code>
        <span>Project</span><a href="https://github.com/gauravvvvvvvvvv/flybox" target="_blank" rel="noreferrer">GitHub ↗</a>
      </aside>
    </div>
  </main>;
}
