# Browser simulation runtime

FLYBOX now has a real client-side FlyBrain path. The host serves static files; the visitor's browser performs neural stepping and world simulation in a Web Worker.

## Current architecture

```text
static host / CDN
      |
      +-- React/Vite UI
      +-- FlyBrain web-export assets
      |     brain.json
      |     meta.bin
      |     weights.0.bin
      |     weights.1.bin
      |
      v
browser
      |
      +-- Web Worker
            +-- real MaleCNS graph
            +-- TypedArray leaky integrate-and-fire stepper
            +-- sensory encoders
            +-- named DN motor readout
            +-- interventions / lesions
            +-- checkpoints / forks / batch probes
```

The server is not in the simulation loop. Browser mode is the default. `VITE_SIMULATION_RUNTIME=server` keeps the Python/WebSocket implementation available as a reference while parity work continues.

## Connectome files

The browser runtime consumes FlyBrain's `export --web` format. The current upstream export contains 166,700 neurons and the MaleCNS connection graph, split into compact gzip files. Topology is preserved while signed synaptic weights are logarithmically quantized to one byte per edge for browser delivery.

During development the worker defaults to a commit-pinned copy of the upstream FlyBrain web export. For production, mirror the immutable files onto the same static origin:

```bash
cd frontend
npm run fetch:connectome
VITE_CONNECTOME_BASE=/connectome/ npm run build
```

That keeps graph delivery on the CDN/static host and avoids a serverless function.

## What is real now

- The full graph is parsed into CSC TypedArrays in the browser.
- Each agent gets its own voltage/spike state while sharing immutable graph topology.
- The LIF update mirrors FlyBrain's browser/Python model.
- Food odor targets ORN_DM1/ORN_DM2.
- Loom/threat inputs target LPLC2/LC4.
- Obstacles target LPLC1.
- Targets use LC10a.
- Touch uses SNta.
- Sound uses JO-A/JO-B populations.
- DNg100, DNa02, DNp01 and MDN drive the named motor readout.
- Population stimulation, silence/restore and seeded synapse lesions operate on the browser neural state.
- Forks copy neural state.
- Checkpoints copy/restore neural state.
- Batch probes run locally against the same shared graph.

PLAY assistance is still an explicit game layer; PURE LAB removes it.

## Scientific boundary

The compact web export uses FlyBrain's 8-bit logarithmic weight encoding, so browser synaptic values are an approximation of the original Float32 weights. Do not describe browser results as bit-identical to the Python backend until parity tests establish the relevant tolerances.

The compact metadata currently does not include MaleCNS soma XYZ positions or FlyBrain photoreceptor azimuth metadata. Consequently:

- the browser runtime does not invent 3D anatomy;
- the 3D soma viewer reports anatomy unavailable in this mode;
- the LIGHT object is displayed to the user but is not injected into fake photoreceptors.

Those can be added by extending the static export format.

## Loading

The worker streams the compressed files, reports progress, decompresses them off the main UI thread and lets normal browser HTTP caching reuse the immutable assets. If loading fails, FLYBOX pauses and shows an error; it does not silently replace real neural activity with fake data.

A future pass can add IndexedDB persistence, service-worker prefetching and range/shard loading if first-visit startup needs further reduction.

## Performance roadmap

The current reference path is CPU + TypedArrays. Next optimization layers should preserve this CPU fallback:

1. benchmark graph stepping on low/mid/high-end laptops;
2. remove avoidable allocations and tune hot loops;
3. evaluate WASM/SIMD;
4. add optional WebGPU where it measurably helps;
5. keep deterministic/parity fixtures against the Python reference.

## Production cutover

Before deleting the hosted Python path:

- run frontend typecheck/build;
- smoke-test a real graph load in Chrome and Firefox;
- compare resting firing and named DN responses with the Python reference;
- verify fork/checkpoint/intervention behavior;
- mirror the graph files to the production static CDN;
- deploy the Vite frontend as static assets only.

The Python engine should remain in the repository as a scientific/reference implementation even after it is removed from production hosting.
