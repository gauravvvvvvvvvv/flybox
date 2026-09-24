#!/usr/bin/env python3
"""Export compact MaleCNS soma XYZ for the browser runtime.

Reads FlyBrain's brain.npz (downloading only that file if missing), applies the
same normalization/orientation used by the Python FLYBOX viewer, and writes a
~1 MB uint16 file aligned by neuron index.

Format:
  0..3   ASCII FLYS
  4..7   uint32 version (1)
  8..11  uint32 neuron count
 12..15  uint32 mapped soma count
 16..    n * 3 little-endian uint16 coordinates
          0..65534 => normalized 0..1
          65535    => coordinate unavailable
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import struct
import urllib.request

try:
    import numpy as np
except ImportError as exc:
    raise SystemExit("numpy is required: python -m pip install numpy") from exc

N = 166_700
SHA256 = "cc9bd1ecd00bd703a6fa648bc6ad145c93c7c1ee53debdcc9ce0d1f4305e6aca"
URL = "https://github.com/alextitonis/fly.ai/releases/download/brain-v1/brain.npz"

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "connectome" / "soma.bin"
DATA = Path(os.environ.get("FLY_DATA", Path.home() / "fly-data"))
BRAIN = DATA / "brain.npz"


def download_brain() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    part = BRAIN.with_suffix(".npz.part")
    digest = hashlib.sha256()

    print(f"downloading FlyBrain anatomy: {URL}")
    with urllib.request.urlopen(URL) as response, part.open("wb") as out:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            digest.update(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {done / 1e6:,.0f} / {total / 1e6:,.0f} MB", end="")
    print()

    if digest.hexdigest() != SHA256:
        part.unlink(missing_ok=True)
        raise SystemExit("downloaded brain.npz failed the pinned sha256 check")
    part.replace(BRAIN)


def main() -> None:
    if not BRAIN.exists():
        download_brain()

    with np.load(BRAIN, allow_pickle=False) as data:
        positions = np.asarray(data["positions"], dtype=np.float32)
        side = np.asarray(data["side"]).astype(str)

    if positions.shape[0] != N or positions.ndim != 2 or positions.shape[1] < 3:
        raise SystemExit(f"unexpected positions shape: {positions.shape}")

    xyz = positions[:, :3].copy()
    valid = ~np.isnan(xyz).any(axis=1)
    ids = np.flatnonzero(valid)
    if ids.size == 0:
        raise SystemExit("brain.npz contains no usable soma coordinates")

    usable = xyz[valid]
    left = side[valid] == "L"
    right = side[valid] == "R"
    if left.any() and right.any() and np.nanmean(usable[right, 0]) < np.nanmean(usable[left, 0]):
        usable[:, 0] *= -1

    lo = np.percentile(usable, 0.2, axis=0)
    hi = np.percentile(usable, 99.8, axis=0)
    span = hi - lo
    scale = float(max(span.max(), 1e-6))
    pad = (scale - span) / 2.0
    norm = np.clip((usable - lo + pad) / scale, 0, 1)

    q = np.full((N, 3), 65535, dtype="<u2")
    q[ids] = np.rint(norm * 65534.0).astype("<u2")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("wb") as out:
        out.write(struct.pack("<4sIII", b"FLYS", 1, N, int(ids.size)))
        out.write(q.tobytes(order="C"))

    print(f"wrote {OUT}")
    print(f"  {ids.size:,} mapped soma / {N:,} neurons")
    print(f"  {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
