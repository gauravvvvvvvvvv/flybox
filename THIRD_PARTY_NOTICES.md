# Third-party notices

FLYBOX is open-source software, but it depends on third-party software and scientific data that retain their original licenses and attribution requirements.

## FlyBrain

FLYBOX uses `flybrain==0.1.0` for the Python reference/backend simulation and adapts the upstream FlyBrain browser connectome loader/stepper for client-side simulation.

Upstream project:
https://github.com/alextitonis/fly.ai

Upstream software license: MIT License.

The browser runtime consumes FlyBrain's commit-pinned `export --web` connectome format. The web format preserves graph topology and uses an 8-bit logarithmic encoding for signed synaptic weights.

## MaleCNS connectome data

FlyBrain/FLYBOX uses scientific data derived from the Janelia/FlyEM adult male *Drosophila melanogaster* central nervous system connectome.

Project:
https://male-cns.janelia.org/

Supplemental repository:
https://github.com/flyconnectome/2025malecns

Public MaleCNS data are distributed under CC BY 4.0 and require attribution. See `DATA_LICENSE.md`.

## Runtime dependencies

FLYBOX also depends on open-source packages including FastAPI, Uvicorn, NumPy, Pydantic, React, Vite, TypeScript, and Vercel Analytics. Each dependency remains subject to its own license.

This file is informational and does not replace the license text distributed by each dependency.
