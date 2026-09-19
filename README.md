# FLYBOX

**An open-source connectome sandbox for experimenting with a simulated fruit-fly nervous system.**

[Live lab](https://flyboxlab.vercel.app/) · [Documentation](https://flyboxlab.vercel.app/docs) · [Contributing](CONTRIBUTING.md) · [License](LICENSE)

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

The current FlyBrain graph contains **166,700 neurons** and roughly **25.6 million synapses**. FLYBOX lets you stimulate and silence populations, create reproducible lesions, build sensory environments, fork neural state, compare agents, inspect live activity in 3D, run structured experiments, and export experiment data.

FLYBOX is open source and contributions are welcome.

## Try it

**Lab:** https://flyboxlab.vercel.app/

**Docs:** https://flyboxlab.vercel.app/docs

Useful documentation entry points:

- [Introduction](https://flyboxlab.vercel.app/docs)
- [Architecture](https://flyboxlab.vercel.app/docs/concepts/architecture)
- [Simulation model](https://flyboxlab.vercel.app/docs/concepts/simulation)
- [Connectome data](https://flyboxlab.vercel.app/docs/neuroscience/connectome)
- [Sensory encoders](https://flyboxlab.vercel.app/docs/neuroscience/sensory-encoders)
- [Motor decoder](https://flyboxlab.vercel.app/docs/neuroscience/motor-decoder)
- [3D brain viewer](https://flyboxlab.vercel.app/docs/neuroscience/brain-viewer)
- [Experiment guide](https://flyboxlab.vercel.app/docs/guides/experiments)
- [API reference](https://flyboxlab.vercel.app/docs/reference/api)
- [Scientific limitations](https://flyboxlab.vercel.app/docs/reference/limitations)

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
- real MaleCNS x/y/z soma coordinates in the 3D viewer;
- bounded live spike overlays;
- pairwise neural and trajectory divergence.

### Intervene

- stimulate a named neural population;
- silence and restore populations;
- apply deterministic seeded synapse lesions;
- change sensory gain;
- fork exact CPU/mock neural state;
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

- FastAPI backend;
- React/Vite frontend;
- WebSocket live-sandbox protocol;
- Python and JavaScript SDKs;
- developer console;
- experiment import/export;
- explicit mock mode for development;
- CI for backend tests and frontend typecheck/build.

## Scientific provenance

FLYBOX intentionally separates five kinds of information:

| Label | Meaning |
|---|---|
| **CONNECTOME DATA** | Structural data from FlyBrain/MaleCNS such as graph weights, cell types, side metadata, and soma coordinates |
| **SIMULATED NEURAL DYNAMICS** | Firing and state produced by FlyBrain |
| **EXPERIMENTAL ENCODER** | FLYBOX mapping from sandbox events into neural input |
| **EXPERIMENTAL DECODER** | FLYBOX mapping from neural readouts into body motion |
| **GAME MECHANIC** | Energy, PLAY assists, bodies, scoring, challenges, and other interaction rules |

FLYBOX does **not** claim a complete biological fly simulation, exact natural behavior, complete sensory transduction, ground-truth motor decoding, cognition, or consciousness.

See the [scientific limitations](https://flyboxlab.vercel.app/docs/reference/limitations) for details.

## Quick local setup

Requirements:

- Python 3.11+
- Node.js 20+
- npm

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r backend/requirements.txt

cd backend
python -m uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite development URL, normally http://localhost:5173.

### Mock development mode

For UI/backend development without loading the real connectome:

macOS/Linux:

```bash
export FLYLAB_MOCK=1
```

PowerShell:

```powershell
$env:FLYLAB_MOCK="1"
```

Mock mode is explicit and visibly labeled. Production never silently falls back to fake neural data.

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

The repository contains `Dockerfile.vercel`, which builds the Vite frontend, installs the Python backend, bundles FlyBrain data at image-build time, and serves the frontend/API/WebSocket from one origin.

The production sandbox is intentionally ephemeral: there are no user accounts or persistent personal worlds.

---

**FLYBOX is a playground, experiment interface, and connectome debugger—not a claim that we have recreated a conscious fly.**
