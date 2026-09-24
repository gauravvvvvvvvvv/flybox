# Browser simulation runtime migration

This branch moves FLYBOX away from paid hosted simulation compute and toward a static-site architecture where each visitor runs their own sandbox locally.

## Target architecture

```text
static host / CDN
      |
      +-- React/Vite UI
      +-- connectome data shards
      |
      v
browser
      |
      +-- Web Worker (simulation loop)
      +-- TypedArray / WASM graph runtime
      +-- optional WebGPU acceleration
      +-- IndexedDB cache for graph shards
```

The production goal is that opening FLYBOX costs the host only static bandwidth. Neural stepping, world updates, interventions, checkpoints, and experiments run on the visitor's CPU/GPU.

## Phase 1 — runtime plumbing (current)

- Browser Web Worker owns the sandbox lifecycle.
- The existing frontend API surface is preserved through a local RPC bridge.
- Browser mode is the default; `VITE_SIMULATION_RUNTIME=server` keeps the Python/WebSocket runtime available during migration.
- The worker currently contains a **compatibility simulation only** so the UI remains interactive while the scientific graph runtime is ported.
- Compatibility frames deliberately report `mock: true`. They must not be presented as FlyBrain output.

## Phase 2 — graph data format

Convert the validated FlyBrain/MaleCNS data into browser-oriented immutable files:

- `indptr`: Uint32Array
- `indices`: Uint32Array
- weights: start with Float32Array for parity, then evaluate safe quantization
- population/side metadata: compact integer dictionaries
- soma positions: Float32Array
- a versioned manifest containing counts, hashes, byte ranges, and provenance

Do not ship one opaque 250+ MB JSON/blob. Keep the graph binary and cacheable.

## Phase 3 — real neural stepper

Port the Python/FlyBrain stepping path behind the same worker API:

1. TypedArray CPU reference implementation.
2. Deterministic parity fixtures against the current Python backend.
3. WASM/SIMD path for ordinary laptops.
4. Optional WebGPU path when supported.
5. Automatic capability selection; CPU must remain supported.

The main UI thread must never run the 25.6M-edge step directly.

## Phase 4 — loading and caching

- Fetch graph assets from static storage/CDN, not a function.
- Stream/download inside the worker.
- Show explicit loading progress.
- Cache immutable versioned graph files in the browser.
- Reuse cached data on future visits.
- Keep the UI shell small enough to appear immediately while graph data loads.

A later optimization can evaluate graph re-encoding/sharding to reduce first-load bytes without changing scientific results.

## Phase 5 — remove production backend compute

Only after parity tests pass:

- switch production to the browser graph runtime;
- deploy the Vite build as static assets;
- remove Python/FlyBrain from the production hosting image;
- retain the Python engine as a reference/test implementation and optional local developer backend.

## Non-negotiables

- No fake anatomy or fake neural claims.
- Browser compatibility mode stays visibly marked until real graph parity passes.
- CPU-only computers must work.
- GPU acceleration is optional.
- Existing PLAY/LAB/BUILD/WEIRD behavior should remain API-compatible.
- Sessions remain ephemeral unless the user explicitly exports them.
