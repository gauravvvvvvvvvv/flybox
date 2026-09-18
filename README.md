# FLY.LAB

An interactive sandbox for experimenting with a **simplified connectome-based fruit-fly simulation**.

FLY.LAB puts a FlyBrain instance into a small closed-loop world:

```text
WORLD → sensory encoding → FlyBrain → descending-neuron activity
  ↑                                             ↓
  └──────────────── movement ← motor mapping ───┘
```

The project is intentionally careful about scientific claims. It does **not** claim to simulate a complete biological fly brain, cognition, or consciousness. The current movement decoder is explicitly labeled **Experimental Motor Mapping**.

## What is implemented

- Real `flybrain==0.1.0` backend by default.
- One selected primary fly: **PRIME**.
- Up to 4 independent full FlyBrain instances by default.
- Real `brain.step(...)` on every neural simulation step.
- Compact WebSocket frames at 20 Hz.
- Real firing counts and descending-neuron activity.
- Side-aware sensory injections using FlyBrain cell metadata.
- Clickable world editor: food, stimulus, looming stimulus, obstacle.
- Closed-loop deterministic movement from side-specific descending-neuron firing.
- Pause, resume, single-step, reset, and 0.25× / 1× / 2× / 5× / 10× controls.
- Population stimulation, silencing and restoration.
- Deterministic random synapse lesion.
- Sensory-gain control.
- Population activity table.
- Experiment log and JSON export.
- Bounded firing-neuron samples for future connectome visualization.
- Explicit development mock mode behind `FLYLAB_MOCK=1`.
- Automated backend tests and frontend typecheck/build.

## Repository

```text
flybox/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   │   └── schemas.py
│   │   └── simulation/
│   │       ├── engine.py
│   │       ├── fly.py
│   │       ├── interventions.py
│   │       ├── mappings.py
│   │       ├── measurements.py
│   │       ├── mockbrain.py
│   │       └── world.py
│   ├── requirements.txt
│   └── tests/
│       └── test_core.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── Arena.tsx
│   │   ├── api.ts
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── types.ts
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── run-backend.ps1
│   └── run-frontend.ps1
├── .github/workflows/ci.yml
├── .gitignore
└── README.md
```

## Requirements

- Python 3.11+ recommended
- Node.js 20+
- npm
- FlyBrain data will be handled by the FlyBrain package
- Optional NVIDIA CUDA setup supported by FlyBrain

## Install

From the repository root:

### Python

PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r .\backend\requirements.txt
```

macOS/Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

### Frontend

```powershell
cd frontend
npm install
cd ..
```

## Run

Open two terminals from the repository root.

### Terminal 1 — backend

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
cd backend
python -m uvicorn app.main:app --reload
```

Or:

```powershell
.\scripts\run-backend.ps1
```

The API is available at:

```text
http://localhost:8000
```

### Terminal 2 — frontend

```powershell
cd frontend
npm run dev
```

Or:

```powershell
.\scripts\run-frontend.ps1
```

Open the Vite URL, normally:

```text
http://localhost:5173
```

## First FlyBrain start

FlyBrain may need to acquire its connectome data on first initialization. That is handled by the FlyBrain package. FLY.LAB does not commit the large connectome arrays to this repository.

If FlyBrain cannot initialize, the API returns:

```text
FlyBrain backend unavailable.
```

It does **not** silently substitute random data.

## Development mock

For UI/backend work without loading the real connectome:

PowerShell:

```powershell
$env:FLYLAB_MOCK="1"
cd backend
python -m uvicorn app.main:app --reload
```

The frontend displays **MOCK MODE** whenever this is active.

Mock mode is not the production/default behavior.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `FLYLAB_MOCK` | `0` | Set to `1` for explicit mock mode |
| `FLYLAB_SEED` | `64` | Root experiment seed |
| `FLYLAB_MAX_FLIES` | `4` | Maximum simultaneous FlyBrain instances |
| `FLY_DEVICE` | `auto` | FlyBrain device selection |
| `FLYLAB_ORIGINS` | `http://localhost:5173` | Allowed frontend origins |
| `VITE_API_URL` | `http://localhost:8000` | Frontend API URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | Frontend WebSocket URL |

## Current sensory mapping

FLY.LAB uses actual FlyBrain metadata for cell types and side.

- Normal visual stimulus → `LC10a`
- Looming stimulus → `LC4` + `LPLC2`
- The world-space bearing chooses the FlyBrain `L` or `R` side metadata.

The injection itself uses the real FlyBrain interface:

```python
brain.step(inject=[(neuron_indices, voltage_amount)])
```

These mappings are experimental task encodings; the UI does not present them as a full biological visual system.

## Experimental Motor Mapping

FlyBrain exposes side metadata for descending neurons, but FLY.LAB does not claim a complete biologically validated motor decoder.

The current deterministic engineering mapping is:

- left/right descending-neuron firing-rate difference → angular turn
- total descending-neuron firing rate → forward speed

The UI labels this **Experimental Motor Mapping**.

## Interventions

Currently implemented:

- stimulate a named population once
- silence a named population
- restore a silenced population
- deterministic random synapse lesion
- sensory-gain change

Every intervention is logged and included in JSON export.

Silencing removes that population from the firing set before the next recurrent propagation, so it changes subsequent dynamics instead of changing only the UI.

## World editor

Select a tool above the arena, then click inside the arena:

- `FOOD`
- `STIMULUS`
- `LOOM`
- `OBSTACLE`

`INSPECT` lets you select a fly.

## Experiment export

Open:

```text
GET /api/experiments/export
```

The export contains:

- format version
- seed
- simulation dt
- simulation time
- world objects
- fly configuration
- sensory gain
- intervention history
- trajectories
- experiment events

## Tests

Backend:

```powershell
cd backend
pytest -q
```

Frontend:

```powershell
cd frontend
npm install
npm run typecheck
npm run build
```

CI performs these checks in explicit mock mode so validation does not require downloading the large connectome dataset.

## Scientific limitations

- This is a simplified leaky integrate-and-fire connectome simulation.
- The FlyBrain model itself contains calibrated, not directly measured, dynamic parameters.
- The current world-to-sensory encoding is an experiment interface, not a full sensory transduction model.
- The motor decoder is an explicit engineering mapping.
- Agent position and energy are simulation-game state.
- The current implementation does not claim cognition, consciousness, or biological behavior equivalence.
- A 10% synapse lesion is a computational intervention, not a claim about a corresponding biological injury.

## Performance

The real graph contains roughly 25.6 million synapses. FLY.LAB therefore:

- caps full FlyBrain agents
- never sends the graph to the browser
- sends only compact metrics and a bounded firing sample
- keeps experiment logs bounded
- does not iterate all synapses in Python per UI frame
- lets FlyBrain's optimized implementation perform propagation

## Screenshots

_Add screenshots here after running the real connectome locally._

## Next milestones

The architecture is ready to extend with:

- full deterministic replay/import
- exact state fork where FlyBrain state copying is validated
- Compare mode and divergence plots
- anatomical connectome view using `brain.positions` when coordinates are suitable
- challenge mode
- mystery-brain experiments
- artificial brain-to-brain coupling

Those are intentionally secondary to keeping the core simulation honest and operational.


## Deploy to Vercel

The repository includes a root `Dockerfile.vercel`. Vercel will build the React/Vite frontend, bundle the FlyBrain Python backend and connectome data into one container, and serve the frontend, REST API, and WebSocket from one origin.

1. In Vercel, choose **Add New → Project**.
2. Import the GitHub repository `gauravvvvvvvvvv/flybox`.
3. Keep the repository root as the project root.
4. Deploy. Vercel auto-detects `Dockerfile.vercel`.
5. Open the generated `*.vercel.app` URL.

No `VITE_API_URL` or `VITE_WS_URL` is required in production; the frontend automatically uses the current HTTPS/WSS origin.

The container defaults to `FLYLAB_MAX_FLIES=2` on Vercel to keep memory usage conservative. Override it in Vercel environment variables if your compute tier has enough memory.

### Vercel caveats

- WebSocket support and large functions are currently Vercel public-beta features.
- FlyBrain's ~260 MB validated connectome is downloaded during the container image build and stored in the image, not downloaded on each cold start.
- Vercel may recycle an instance. The browser automatically reconnects, but in-memory experiment state is not durable across instance replacement.
- For durable long-running public experiments, move experiment state to external storage or use a dedicated persistent backend.


## FLYBOX V2 — Play first, inspect deeper

The project now has four surfaces over the same simulation:

### PLAY

Designed to be understandable without neuroscience knowledge.

- Spawn and rename agents.
- Swap bodies: fly, car, bot, drone, walker, ship or synth.
- Grab any agent with the mouse and move it.
- Possess the selected body with WASD while its connectome keeps receiving sensory input.
- Add or drag fruit, targets, looming objects, predators, sound sources, lights, goals and walls.
- Paint non-edible odor fields directly into the arena.
- Watch plain-language `WHY?` explanations for current behavior.
- See a separate `GAME ASSIST · NOT BIOLOGY` meter whenever PLAY's locomotion/foraging helpers are active.
- Earn local session achievements.

### CHALLENGES

Included challenge presets:

- Snack Attack
- Don't Get Squished
- You vs Fly
- Fly Race
- Brain Car
- Maze Run
- Mutation Tournament
- Connectome Hijack
- Mystery Brain
- Sandbox

Mutation Tournament gives rivals explicit reproducible modifications rather than merely cosmetic labels.

### LAB

The scientific/technical layer includes:

- real FlyBrain firing counts
- real descending-neuron traces
- named DNg100 forward readout
- named DNa02 left/right steering readout
- named DNp01 escape readout
- named MDN backward readout
- population stimulation, silencing and seeded lesions
- live pairwise firing-set Jaccard divergence
- live physical/trajectory divergence
- real MaleCNS soma-position visualization when `brain.positions` is available
- bounded live firing overlays on the anatomical projection
- 4-replicate native FlyBrain batch probes using one shared connectome graph
- experiment JSON export

The anatomical brain view does not invent coordinates. If position metadata is absent, the UI says the view is unavailable.

### BUILD

- click-to-place world editor
- draggable world objects
- odor paintbrush
- random seeded worlds
- daily deterministic world
- daylight/night presentation
- wind body mechanic
- reproducible share links

A share link stores the sandbox setup in a compressed `#box=...` URL fragment, so it can be passed around without requiring an account/database.

### WEIRD

- neural-firework overlay
- live connectome-to-audio tone
- arbitrary body swaps
- Brain Car / Synth Brain
- exact CPU/mock brain forking
- artificial Brain → Brain coupling
- Chaos Button
- Cinema mode

Brain-to-brain coupling is explicitly labeled an **experimental artificial coupling**. It is not presented as biological fly communication.

## Time Machine

On CPU/mock backends, **SAVE MOMENT** records an exact in-memory checkpoint including:

- FlyBrain membrane state
- current spike state
- FlyBrain RNG state
- neural traces
- world state
- agent state
- intervention state
- queued stimulation
- challenge state
- artificial brain couplings

**REWIND** restores that checkpoint.

Exact CUDA checkpoint/fork support is intentionally disabled until CuPy state cloning has been validated.

## Senses

Current experimental world encoders:

| World input | Neural input |
|---|---|
| Fruit / odor paint | ORN_DM1 + ORN_DM2 |
| Target | LC10a |
| Looming object | LPLC2 using angular growth |
| Close threat | LC4 |
| Touching wall | SNta |
| Sound source | JO-A / JO-B populations |
| Light | FlyBrain photoreceptors using stored azimuth metadata |

These are experimental encoders around the connectome. They are not a claim that the sandbox reproduces full fly sensory transduction.

## PLAY versus LAB

This distinction is central to FLYBOX.

The simplified spiking FlyBrain model does not reliably convert ordinary sensory drive into a complete walking command. Therefore:

- **LAB**: no locomotion/foraging assist. Named descending-neuron signals alone drive the engineering body decoder.
- **PLAY**: adds visible deterministic search, food-foraging and predator-avoidance body assists so the sandbox is enjoyable.

The UI always exposes the assist values separately from neural outputs.

## Developer surface

The live REST/WebSocket API can be used directly.

Developer console examples:

```text
stim LC4 0.8
silence LC10a
restore LC10a
spawn food .5 .5
fork
random 42
challenge race
```

Small client SDKs are included:

```text
sdk/python/flybox.py
sdk/js/flybox.ts
examples/hijack.py
```

## Shared sessions

All connected browsers to one running FLYBOX server see the same in-memory world and can manipulate it together. The header shows a PARTY viewer count when multiple clients are connected.

This is deliberately not described as a full multiplayer-room system yet: accounts, room isolation, persistence, moderation and public community-level storage require external persistent infrastructure.

## Resource honesty

A real FlyBrain agent owns a full neural state over the 166,700-neuron connectome. FLYBOX therefore retains a strict full-agent limit.

It does not fake a 20-agent "real connectome colony" by silently replacing extra brains with random lightweight agents.

For large statistical work, use the native batched probe API instead of spawning many independent UI agents.

