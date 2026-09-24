/**
 * Browser-side FlyBrain-compatible connectome runtime.
 *
 * Data format and LIF update are adapted from alextitonis/fly.ai
 * (MIT-licensed FlyBrain browser port), pinned to the same MaleCNS v1.0
 * export format used by FlyBrain:
 *
 *   v <- exp(-dt/tau) * v + gain * (W @ spikes) + tonic + noise + injected
 *   v >= 1 -> spike, reset to 0
 *
 * The web export stores the real MaleCNS graph as compact gzipped CSC data.
 * Synaptic weights are log-quantized to one byte per edge by FlyBrain's
 * `flybrain export --web` command.
 */

export interface ConnectomeParams {
  dt: number;
  tau: number;
  gain: number;
  tonic: number;
  noise_hz: number;
  noise_amp: number;
}

export interface ConnectomeMeta {
  n: number;
  types: string[];
  superclasses: string[];
  params: ConnectomeParams;
  sensoryInput: boolean;
  typeIdx: Uint16Array;
  classIdx: Uint8Array;
  /** 0 unknown, 1 left, 2 right */
  side: Uint8Array;
}

export interface ConnectomeWeights {
  n: number;
  nnz: number;
  /** CSC: targets of presynaptic neuron j are rowIdx[colPtr[j]..colPtr[j+1]) */
  colPtr: Uint32Array;
  rowIdx: Uint32Array;
  /** weight code per synapse; lut[code] is the signed weight */
  code: Uint8Array;
  lut: Float32Array;
}

export interface ConnectomeInfo {
  neurons: number;
  connections: number;
  ln_min: number;
  weights_mb: number;
  parts: string[];
  meta_mb: number;
  weight_error_mean?: number;
  weight_error_max?: number;
}

export type BrainSnapshot = {
  v: Float32Array | number[];
  fired: Int32Array | number[];
  firedCount: number;
  steps: number;
  rngState: number;
  lesionMask: Uint8Array | number[] | null;
};

const decoder = new TextDecoder();

function assertMagic(view: DataView, expected: string) {
  const got = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (got !== expected) {
    throw new Error(`Invalid connectome file: expected ${expected}, got ${JSON.stringify(got)}`);
  }
}

export function parseMeta(buf: ArrayBuffer): ConnectomeMeta {
  const view = new DataView(buf);
  assertMagic(view, "FLYM");
  const n = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const header = JSON.parse(
    decoder.decode(new Uint8Array(buf, 16, jsonLength)),
  ) as {
    types: string[];
    superclasses: string[];
    params: ConnectomeParams;
    sensory_input: boolean;
  };

  let at = 16 + jsonLength;
  const typeIdx = new Uint16Array(buf.slice(at, at + 2 * n));
  at += 2 * n;
  const classIdx = new Uint8Array(buf, at, n);
  at += n;
  const side = new Uint8Array(buf, at, n);

  return {
    n,
    types: header.types,
    superclasses: header.superclasses,
    params: header.params,
    sensoryInput: header.sensory_input,
    typeIdx,
    classIdx,
    side,
  };
}

export function parseWeights(buf: ArrayBuffer): ConnectomeWeights {
  const view = new DataView(buf);
  assertMagic(view, "FLYW");
  const n = view.getUint32(8, true);
  const nnz = view.getUint32(12, true);
  const lnMin = view.getFloat32(16, true);
  const bytes = new Uint8Array(buf);

  let at = 20;
  const readVarint = () => {
    let value = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = bytes[at++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return value;
  };

  const colPtr = new Uint32Array(n + 1);
  for (let j = 0; j < n; j++) {
    colPtr[j + 1] = colPtr[j] + readVarint();
  }

  const rowIdx = new Uint32Array(nnz);
  for (let j = 0; j < n; j++) {
    let row = 0;
    for (
      let edge = colPtr[j], first = true;
      edge < colPtr[j + 1];
      edge++, first = false
    ) {
      row = first ? readVarint() : row + readVarint();
      rowIdx[edge] = row;
    }
  }

  const code = bytes.slice(at, at + nnz);
  const lut = new Float32Array(256);
  for (let q = 0; q < 128; q++) {
    const magnitude = Math.exp(lnMin * (1 - q / 127));
    lut[q] = magnitude;
    lut[q | 0x80] = -magnitude;
  }

  return { n, nnz, colPtr, rowIdx, code, lut };
}

export function cells(
  meta: ConnectomeMeta,
  names: string[],
  side?: "L" | "R",
): Int32Array {
  const wanted = new Set(names);
  const typeHit = meta.types.map((name) => wanted.has(name));
  const classHit = meta.superclasses.map((name) => wanted.has(name));
  const wantedSide = side === "L" ? 1 : side === "R" ? 2 : 0;
  const out: number[] = [];

  for (let i = 0; i < meta.n; i++) {
    if (!(typeHit[meta.typeIdx[i]] || classHit[meta.classIdx[i]])) continue;
    if (wantedSide && meta.side[i] !== wantedSide) continue;
    out.push(i);
  }

  return Int32Array.from(out);
}

export function cellsWithPrefix(
  meta: ConnectomeMeta,
  prefixes: string[],
  side?: "L" | "R",
): Int32Array {
  const hit = meta.types.map((name) =>
    prefixes.some((prefix) => name.startsWith(prefix)),
  );
  const wantedSide = side === "L" ? 1 : side === "R" ? 2 : 0;
  const out: number[] = [];

  for (let i = 0; i < meta.n; i++) {
    if (!hit[meta.typeIdx[i]]) continue;
    if (wantedSide && meta.side[i] !== wantedSide) continue;
    out.push(i);
  }

  return Int32Array.from(out);
}

class Mulberry32 {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function hash32(value: number, seed: number) {
  let x = (value ^ seed) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export class ConnectomeBrain {
  readonly n: number;
  readonly v: Float32Array;
  readonly drive: Float32Array;
  readonly current: Float32Array;
  readonly fired: Int32Array;
  firedCount = 0;
  steps = 0;

  readonly weights: ConnectomeWeights;
  readonly params: ConnectomeParams;

  private rng: Mulberry32;
  private lesionMask: Uint8Array | null = null;

  constructor(
    weights: ConnectomeWeights,
    params: ConnectomeParams,
    seed = 64,
  ) {
    this.weights = weights;
    this.params = params;
    this.n = weights.n;
    this.v = new Float32Array(this.n);
    this.drive = new Float32Array(this.n);
    this.current = new Float32Array(this.n);
    this.fired = new Int32Array(this.n);
    this.rng = new Mulberry32(seed);
  }

  stimulate(indices: Int32Array, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) return;
    for (let k = 0; k < indices.length; k++) {
      this.drive[indices[k]] += amount;
    }
  }

  step() {
    const { colPtr, rowIdx, code, lut } = this.weights;
    const current = this.current;
    current.fill(0);

    const lesions = this.lesionMask;
    if (lesions) {
      for (let k = 0; k < this.firedCount; k++) {
        const presynaptic = this.fired[k];
        for (
          let edge = colPtr[presynaptic];
          edge < colPtr[presynaptic + 1];
          edge++
        ) {
          if (!lesions[edge]) {
            current[rowIdx[edge]] += lut[code[edge]];
          }
        }
      }
    } else {
      for (let k = 0; k < this.firedCount; k++) {
        const presynaptic = this.fired[k];
        for (
          let edge = colPtr[presynaptic];
          edge < colPtr[presynaptic + 1];
          edge++
        ) {
          current[rowIdx[edge]] += lut[code[edge]];
        }
      }
    }

    const p = this.params;
    const decay = Math.exp(-p.dt / p.tau);
    const noiseProbability = p.noise_hz * p.dt;
    let firedCount = 0;

    for (let i = 0; i < this.n; i++) {
      let voltage =
        decay * this.v[i] +
        p.gain * current[i] +
        p.tonic +
        this.drive[i];

      if (this.rng.next() < noiseProbability) voltage += p.noise_amp;

      if (voltage >= 1) {
        this.fired[firedCount++] = i;
        voltage = 0;
      }

      this.v[i] = voltage;
      this.drive[i] = 0;
    }

    this.firedCount = firedCount;
    this.steps += 1;
    return this.fired.subarray(0, firedCount);
  }

  filterFired(blocked: Uint8Array | null) {
    if (!blocked || this.firedCount === 0) {
      return this.fired.subarray(0, this.firedCount);
    }

    let write = 0;
    for (let read = 0; read < this.firedCount; read++) {
      const neuron = this.fired[read];
      if (!blocked[neuron]) this.fired[write++] = neuron;
    }
    this.firedCount = write;
    return this.fired.subarray(0, write);
  }

  lesion(fraction: number, seed: number) {
    const bounded = Math.min(1, Math.max(0, fraction));
    if (bounded <= 0) return 0;

    if (!this.lesionMask) {
      this.lesionMask = new Uint8Array(this.weights.nnz);
    }

    const threshold = bounded * 4294967296;
    let changed = 0;
    for (let edge = 0; edge < this.lesionMask.length; edge++) {
      if (this.lesionMask[edge]) continue;
      if (hash32(edge, seed) < threshold) {
        this.lesionMask[edge] = 1;
        changed++;
      }
    }
    return changed;
  }

  clearLesions() {
    this.lesionMask = null;
  }

  snapshot(): BrainSnapshot {
    return {
      v: this.v.slice(),
      fired: this.fired.slice(0, this.firedCount),
      firedCount: this.firedCount,
      steps: this.steps,
      rngState: this.rng.state,
      lesionMask: this.lesionMask?.slice() ?? null,
    };
  }

  restore(snapshot: BrainSnapshot) {
    if (snapshot.v.length !== this.n) {
      throw new Error("Checkpoint neural state does not match this connectome");
    }

    const fired =
      snapshot.fired instanceof Int32Array
        ? snapshot.fired
        : Int32Array.from(snapshot.fired);
    const lesions =
      snapshot.lesionMask == null
        ? null
        : snapshot.lesionMask instanceof Uint8Array
          ? snapshot.lesionMask
          : Uint8Array.from(snapshot.lesionMask);

    this.v.set(snapshot.v);
    this.drive.fill(0);
    this.current.fill(0);
    this.fired.fill(0);
    this.fired.set(fired.subarray(0, snapshot.firedCount));
    this.firedCount = snapshot.firedCount;
    this.steps = snapshot.steps;
    this.rng.state = snapshot.rngState >>> 0;
    this.lesionMask = lesions?.slice() ?? null;
  }

  copyStateFrom(other: ConnectomeBrain) {
    this.v.set(other.v);
    this.drive.set(other.drive);
    this.current.set(other.current);
    this.fired.fill(0);
    this.fired.set(other.fired.subarray(0, other.firedCount));
    this.firedCount = other.firedCount;
    this.steps = other.steps;
    this.rng.state = other.rng.state;
    this.lesionMask = other.lesionMask?.slice() ?? null;
  }
}

function ensureTrailingSlash(base: string) {
  return base.endsWith("/") ? base : `${base}/`;
}

async function fetchOne(
  url: string,
  onBytes: (count: number) => void,
) {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "omit",
  });
  if (!response.ok || !response.body) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onBytes(value.length);
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function fetchParts(
  urls: string[],
  label: string,
  report: (text: string) => void,
  totalMb = 0,
) {
  let downloaded = 0;
  let lastReport = 0;
  const reportBytes = (count: number) => {
    downloaded += count;
    if (downloaded - lastReport >= 1_000_000) {
      lastReport = downloaded;
      report(
        `${label} ${(downloaded / 1e6).toFixed(0)}${totalMb ? ` / ${totalMb.toFixed(0)}` : ""} MB`,
      );
    }
  };

  // Weight parts are independent HTTP objects. Fetch them concurrently so a
  // first visit is limited by available bandwidth rather than serial latency.
  const parts = await Promise.all(
    urls.map((url) => fetchOne(url, reportBytes)),
  );

  const blob = new Blob(parts as BlobPart[]);
  const first = parts[0];
  const isGzip = first?.[0] === 0x1f && first?.[1] === 0x8b;

  if (!isGzip) return blob.arrayBuffer();
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser cannot decompress the FlyBrain web export (DecompressionStream unavailable)",
    );
  }

  report(`${label} decompressing`);
  return new Response(
    blob.stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
}

export async function loadConnectome(
  rawBase: string,
  report: (text: string) => void = () => {},
) {
  const base = ensureTrailingSlash(rawBase);
  report("connectome manifest");

  const manifestResponse = await fetch(`${base}brain.json`, {
    cache: "force-cache",
    credentials: "omit",
  });
  if (!manifestResponse.ok) {
    throw new Error(
      `${base}brain.json: HTTP ${manifestResponse.status}`,
    );
  }

  const info = (await manifestResponse.json()) as ConnectomeInfo;

  report("neuron labels");
  const meta = parseMeta(
    await fetchParts([`${base}meta.bin`], "labels", report),
  );

  report("connectome");
  const weightsBuffer = await fetchParts(
    info.parts.map((part) => `${base}${part}`),
    "connectome",
    report,
    info.weights_mb,
  );

  report("wiring 25M synapses");
  const weights = parseWeights(weightsBuffer);

  if (weights.n !== meta.n) {
    throw new Error(
      `Connectome metadata mismatch: weights have ${weights.n} neurons, metadata has ${meta.n}`,
    );
  }

  report("ready");
  return { info, meta, weights };
}
