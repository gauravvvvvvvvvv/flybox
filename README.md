# FLYBOX

**An open-source connectome sandbox for experimenting with a simulated fruit-fly nervous system.**

<a href="https://www.producthunt.com/products/flybox-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-flybox-2" target="_blank" rel="noopener noreferrer"><img alt="FLYBOX - Explore a fruit-fly connectome inside a living sandbox | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1260414&theme=dark"></a>

[Browser runtime notes](docs/BROWSER_RUNTIME.md) · [Contributing](CONTRIBUTING.md) · [License](LICENSE)

FLYBOX places a FlyBrain neural simulation inside an interactive closed-loop world:

```text
WORLD
  ↓
experimental sensory encoder
  ↓
FlyBrain connectome simulation
  ↓
descending-neuron readout
  ↓
experimental body decoder
  ↓
WORLD
```

The browser runtime loads **166,700 neurons** and **25,088,107 recurrent graph edges** from FlyBrain's compact MaleCNS web export. FLYBOX lets you stimulate and silence populations, create reproducible lesions, build sensory environments, fork neural state, compare agents, inspect live activity in 3D, run structured experiments, and export experiment data.

FLYBOX is open source and contributions are welcome.

## Runtime

The default production path is browser-compute-first:

```text
static host / CDN
        ↓
React UI + immutable FlyBrain web-export files
        ↓
browser Web Worker
        ↓
real connectome stepping on the visitor's CPU
```

See [docs/BROWSER_RUNTIME.md](docs/BROWSER_RUNTIME.md) for the data format, scientific boundaries, and deployment steps.

## What you can do

### Build a world

Place and manipulate:

- fruit and odor fields;
- visual targets and goals;
- looming stimuli;
- predators;
- sound and light sources;
- walls and obstacles.

### Inspect the simulated nervous system

- live firing counts and firing fractions;
- descending-neuron traces;
- DNg100, DNa02, DNp01, and MDN readouts;
- population firing and silencing state;
- live firing sets and named-population activity;
- real MaleCNS soma XYZ anatomy from the separately generated static `soma.bin` asset; neurons with unavailable coordinates are omitted rather than fabricated;
- pairwise neural and trajectory divergence.

### Intervene

- stimulate a named neural population;
- silence and restore populations;
- apply deterministic seeded synapse lesions;
- change sensory gain;
- fork exact browser neural state;
- rewind exact in-session checkpoints.

### Experiment

Included structured modes cover:

- food seeking;
- threat avoidance;
- races and maze tasks;
- mutation/intervention comparisons;
- limited-budget connectome stimulation;
- hidden-intervention inference;
- recent-history/state-dependence experiments.

### Extend it

The repository includes:

- React/Vite frontend;
- browser Web Worker simulation runtime;
- TypedArray FlyBrain/MaleCNS connectome loader and stepper;
- optional Python/FastAPI reference backend;
- Python and JavaScript SDKs;
- developer console;
- experiment import/export.

## Scientific provenance

FLYBOX intentionally separates five kinds of information:

| Label | Meaning |
|---|---|
| **CONNECTOME DATA** | Structural data from FlyBrain/MaleCNS such as graph weights, cell types, and side metadata; soma coordinates are used only when actually present |
| **SIMULATED NEURAL DYNAMICS** | Firing and state produced by FlyBrain |
| **EXPERIMENTAL ENCODER** | FLYBOX mapping from sandbox events into neural input |
| **EXPERIMENTAL DECODER** | FLYBOX mapping from neural readouts into body motion |
| **GAME MECHANIC** | Energy, PLAY assists, bodies, scoring, challenges, and other interaction rules |

FLYBOX does **not** claim a complete biological fly simulation, exact natural behavior, complete sensory transduction, ground-truth motor decoding, cognition, or consciousness.

See [docs/BROWSER_RUNTIME.md](docs/BROWSER_RUNTIME.md) and the in-app documentation for current scientific/runtime limitations.

## Quick local setup

Requirements for the browser runtime source:

- Node.js 20+
- npm

The deployed app needs no Python. The repository's production build currently uses Python + NumPy only at build time to generate the static `soma.bin` anatomy asset; Python is also needed for the optional reference backend.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite development URL, normally http://localhost:5173. Browser mode loads the commit-pinned static FlyBrain export and pauses with an error rather than silently substituting fake neural activity if that load fails.

For an offline/static production bundle:

```bash
npm run fetch:connectome
VITE_CONNECTOME_BASE=/connectome/ npm run build
```

### Optional Python reference backend

```bash
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload
```

The current frontend is intentionally browser-only and does not switch to this backend. Use the backend/tests or a separate client when comparing the reference implementation.

## Tests

Backend:

```bash
cd backend
pytest -q
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

## Repository

```text
flybox/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   └── simulation/
│   └── tests/
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── Arena.tsx
│       ├── BrainView.tsx
│       ├── DocsPage.tsx
│       └── api.ts
├── docs/
├── sdk/
├── examples/
├── .github/
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── DATA_LICENSE.md
├── THIRD_PARTY_NOTICES.md
└── LICENSE
```

## Contributing

Contributions are welcome from engineers, neuroscientists, students, designers, educators, and researchers.

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Changes that touch neuroscience should clearly distinguish measured/source data from simulated dynamics, experimental mappings, and game logic.

Good areas for contributions include:

- full neuron morphology / skeleton rendering;
- circuit and graph exploration;
- population search;
- experiment protocol tooling;
- activity recording and timeline analysis;
- reproducibility and validation;
- SDK/API improvements;
- performance;
- accessibility;
- docs and tutorials.

For public launch tasks, see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## Data and third-party licensing

FLYBOX software is licensed under the **Apache License 2.0**.

MaleCNS-derived scientific data and third-party dependencies retain their own licenses and attribution requirements. See:

- [DATA_LICENSE.md](DATA_LICENSE.md)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## Security

Please do not report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md).

## Deployment

Production can be a static Vite deployment. Mirror the immutable connectome files with `npm run fetch:connectome`, build with `VITE_CONNECTOME_BASE=/connectome/`, and serve `frontend/dist` from a CDN/static host. Neural stepping and sandbox state stay in the visitor's browser, so no hosted simulation CPU is required.

The Python backend remains available as a reference/development path and does not need to be deployed with the public browser runtime.

---

**FLYBOX is a playground, experiment interface, and connectome debugger—not a claim that we have recreated a conscious fly.**
