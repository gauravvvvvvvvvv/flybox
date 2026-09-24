# Contributing to FLYBOX

FLYBOX is open source and contributions are welcome from software engineers, neuroscientists, students, designers, educators, and curious experimenters.

The project has one non-negotiable rule:

> **Make it useful and fun without hiding what is real, simulated, experimental, or invented.**

Before contributing, please read the [Code of Conduct](CODE_OF_CONDUCT.md), [scientific limitations](docs/FLYBOX.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Ways to contribute

Good contributions include:

- neuroscience corrections or better-supported sensory/motor mappings;
- new reproducible experiments and challenge protocols;
- connectome visualization and morphology tooling;
- population/circuit inspection tools;
- performance work on the backend or browser;
- SDK/API improvements;
- accessibility and UI improvements;
- documentation, tutorials, examples, and scientific references;
- tests and reproducibility improvements;
- bug fixes.

For substantial scientific changes, open an issue first so assumptions and evidence can be discussed before implementation.

## Scientific contribution standard

Every feature that touches biology must identify its provenance.

Use these categories consistently:

1. **CONNECTOME DATA** — structural facts supplied by FlyBrain/MaleCNS.
2. **SIMULATED NEURAL DYNAMICS** — state produced by the FlyBrain model.
3. **EXPERIMENTAL ENCODER** — FLYBOX mapping from sandbox state into neural input.
4. **EXPERIMENTAL DECODER** — FLYBOX mapping from neural output into body behavior.
5. **GAME MECHANIC** — rules added for interaction, playability, scoring, or presentation.

Do not present an engineering mapping as a measured biological mechanism.

If a contribution makes a new neuroscience claim, include a primary-source citation when possible and describe any uncertainty or disagreement.

## Development setup

### Python reference backend

Python 3.11+ is recommended. The Python backend remains the scientific/reference implementation and optional developer comparison path; the production browser runtime does not require it.

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt
```

Run the backend:

```bash
cd backend
python -m uvicorn app.main:app --reload
```

### Frontend

Node.js 20+ is recommended.

```bash
cd frontend
npm install
npm run dev
```

Browser mode is the default. To mirror the commit-pinned FlyBrain web export into the static site before a production build:

```bash
npm run fetch:connectome
VITE_CONNECTOME_BASE=/connectome/ npm run build
```

The default development runtime can also fetch the pinned upstream static export directly.

### Mock mode

Most UI/backend development does not need the full connectome download.

macOS/Linux:

```bash
export FLYLAB_MOCK=1
```

PowerShell:

```powershell
$env:FLYLAB_MOCK="1"
```

Mock mode must remain visibly labeled and must never silently replace real FlyBrain in production.

## Tests

Before opening a pull request:

```bash
cd backend
pytest -q
```

and:

```bash
cd frontend
npm run typecheck
npm run build
```

When CI is unavailable, run the backend reference tests plus frontend typecheck/build locally before merging.

For changes to real-connectome behavior, also describe how you validated the change against a real FlyBrain run.

## Pull request expectations

Keep pull requests focused. A good PR includes:

- the problem being solved;
- the approach taken;
- screenshots/video for visible UI changes;
- tests or an explanation of why tests are not applicable;
- scientific provenance/claims affected by the change;
- performance impact if the change touches live frames, graph operations, or multi-agent state;
- documentation updates for public-facing behavior.

Do not mix unrelated refactors into a scientific or behavioral change.

## Architecture boundaries

### World and embodiment

Game/world state belongs in the world/body layer. Do not smuggle game state into FlyBrain and then describe it as neural state.

### Sensory encoders

New environmental signals should enter through explicit encoder code. Prefer named, documented populations and side-aware mappings.

### Neural interventions

Interventions must alter simulation state or graph state—not only the UI—and must be serializable/loggable when possible.

### Browser runtime and payloads

The production direction is browser-compute-first. The immutable FlyBrain web export is loaded as static data and neural stepping runs in a Web Worker.

Do not move the neural stepper back into hosted request/function compute. Keep large immutable graph assets cacheable and off the main UI thread. If the browser payload changes, document its size, encoding, provenance, and first-load impact.

### Reproducibility

Prefer deterministic seeds. Experiments should export enough configuration to understand how a result was produced.

## Adding a new experiment

A strong experiment should document:

1. the question;
2. initial conditions;
3. manipulated variable;
4. control condition;
5. neural measurements;
6. embodied measurements, if any;
7. stopping rule/duration;
8. interpretation limits.

Do not label short-term state persistence as learning or memory unless the model actually implements and validates the mechanism being claimed.

## Commit style

Use concise imperative commit messages, for example:

```text
Add LC4 intervention comparison
Fix nested docs route handling
Document MaleCNS data attribution
```

## Reporting bugs

Use the bug report issue template. Include:

- browser/OS;
- real FlyBrain or mock mode;
- steps to reproduce;
- expected vs actual behavior;
- console/backend logs where relevant;
- seed and exported experiment JSON if the bug is simulation-specific.

## Security issues

Do not open public issues for suspected security vulnerabilities. Follow [SECURITY.md](SECURITY.md).

## Licensing

By contributing, you agree that your contribution is licensed under the repository's [Apache License 2.0](LICENSE).

Third-party scientific data and dependencies keep their own licenses. See [DATA_LICENSE.md](DATA_LICENSE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
