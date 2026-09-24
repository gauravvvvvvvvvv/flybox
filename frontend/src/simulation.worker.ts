import type {
  ArenaObject,
  ChallengeState,
  FlyFrame,
  Frame,
  Metadata,
  WorldKind,
} from "./types";
import {
  ConnectomeBrain,
  cells,
  cellsWithPrefix,
  loadConnectome,
  type BrainSnapshot,
  type ConnectomeMeta,
  type ConnectomeWeights,
} from "./connectome";

type BodyType = FlyFrame["body_type"];
type Controller = FlyFrame["controller"];
type Side = "L" | "R";

type LocalFly = Omit<FlyFrame, "lesion_fraction"> & {
  seed: number;
  sensoryGain: number;
  manualTurn: number;
  manualThrottle: number;
  manualUntil: number;
  touchSide: Side | null;
  previousOdor: number;
  lastEscape: number;
  silenced: string[];
  lesionFraction: number;
};

type NeuralState = {
  brain: ConnectomeBrain;
  previousFired: Int32Array;
  dnTrace: number;
  motorSmooth: Record<string, number>;
  previousSize: Record<string, number>;
  pending: Array<{ idx: Int32Array; amount: number }>;
  silenced: Set<string>;
  blocked: Uint8Array | null;
};

type NeuralSnapshot = {
  brain: BrainSnapshot;
  previousFired: Int32Array;
  dnTrace: number;
  motorSmooth: Record<string, number>;
  previousSize: Record<string, number>;
  pending: Array<{ idx: Int32Array; amount: number }>;
  silenced: string[];
};

type MysterySecret = {
  fly_id: string;
  type: "silence_population";
  target: string;
};

type BrowserHistoryState = NonNullable<ChallengeState["history"]> & {
  exposure_ends: number;
  body_type: BodyType;
  controller: Controller;
  neural_sum: number;
};

type Snapshot = {
  t: number;
  running: boolean;
  speed: number;
  world: Frame["world"];
  flies: LocalFly[];
  events: Frame["events"];
  couplings: Frame["couplings"];
  achievements: Frame["achievements"];
  challenge: ChallengeState;
  mysterySecret: MysterySecret | null;
  historyState: BrowserHistoryState | null;
  neural: Record<string, NeuralSnapshot>;
};

type Checkpoint = {
  id: string;
  label: string;
  t: number;
  snapshot: Snapshot;
};

type RpcRequest = {
  type: "rpc";
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: any;
};

type InboundMessage =
  | RpcRequest
  | { type: "subscribe" }
  | { type: "unsubscribe" }
  | { type: "close" };

type SensoryItem = {
  object: ArenaObject;
  distance: number;
  bearing: number;
  angularSize: number;
  drive: number;
  clearance?: number;
};

type SensorySnapshot = {
  visual: SensoryItem[];
  food: SensoryItem[];
  sound: SensoryItem[];
  obstacles: SensoryItem[];
};

type NeuralGroups = {
  populations: Record<string, Int32Array>;
  orn: Int32Array;
  hearing: Int32Array;
  visual: {
    loom: Record<Side, Int32Array>;
    threat: Record<Side, Int32Array>;
    small: Record<Side, Int32Array>;
    target: Record<Side, Int32Array>;
  };
  touch: Record<Side, Int32Array>;
  motor: Record<string, Int32Array>;
  dn: Int32Array;
};

const scope = globalThis as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<InboundMessage>) => void) | null;
  close?: () => void;
};

const KNOWN_POPS = [
  "LC4",
  "LPLC2",
  "LPLC1",
  "LC10a",
  "LC6",
  "LC16",
  "LC15",
  "ORN_DM1",
  "ORN_DM2",
  "SNta",
  "DNg100",
  "DNa02",
  "DNp01",
  "MDN",
  "descending_neuron",
] as const;

const FALLBACK_POPULATIONS: Record<string, number> = {
  LC4: 126,
  LPLC2: 185,
  LPLC1: 170,
  LC10a: 275,
  LC6: 124,
  LC16: 182,
  LC15: 126,
  ORN_DM1: 80,
  ORN_DM2: 80,
  SNta: 120,
  DNg100: 28,
  DNa02: 24,
  DNp01: 20,
  MDN: 16,
  descending_neuron: 1314,
};

const CHALLENGES: Metadata["challenges"] = {
  sandbox: {
    name: "Playground",
    description: "No objective. Build a world and poke the brains.",
    goal: "sandbox",
  },
  food_run: {
    name: "Snack Attack",
    description: "Get the agents to finish 3 food items.",
    goal: "food",
    target: 3,
  },
  survive: {
    name: "Don't Get Squished",
    description: "Keep at least one fly alive for 60 simulated seconds.",
    goal: "survive",
    target: 60,
  },
  hunt: {
    name: "You vs Fly",
    description: "Use HAND to drag the predator. The agent wins if it survives 30 seconds.",
    goal: "survive",
    target: 30,
  },
  braincar: {
    name: "Brain Car",
    description: "Put the selected connectome in a car body and race to the goal.",
    goal: "race",
  },
  hijack: {
    name: "Connectome Hijack",
    description: "Reach high descending-neuron activity using at most 5 manual stimulations.",
    goal: "dn_activity",
    target: 0.12,
    budget: 5,
  },
  race: {
    name: "Fly Race",
    description: "First agent to the glowing target wins.",
    goal: "race",
  },
  maze: {
    name: "Maze Run",
    description: "Navigate the walls and take a bite from the fruit at the far end.",
    goal: "first_food",
    target: 1,
  },
  tournament: {
    name: "Mutation Tournament",
    description: "Multiple agents share one arena. First to 5 bites wins.",
    goal: "first_food",
    target: 5,
  },
  mystery: {
    name: "Mystery Brain",
    description: "One non-primary agent can receive a hidden reproducible intervention.",
    goal: "mystery",
  },
  history: {
    name: "Recent History",
    description: "Compare identical brain states after different recent sensory histories.",
    goal: "history",
  },
};

const BODIES: BodyType[] = [
  "fly",
  "car",
  "bot",
  "drone",
  "walker",
  "ship",
  "synth",
];

const BODY_SPEED: Record<BodyType, number> = {
  fly: 1,
  car: 1.45,
  bot: 0.8,
  drone: 1.3,
  walker: 0.65,
  ship: 1.7,
  synth: 0,
};

const EXPECTED_NEURONS = 166_700;
const EXPECTED_SYNAPSES = 25_582_938;
const DT = 0.02;
const MAX_FLIES = 4;
const CONNECTOME_BASE = String(
  import.meta.env.VITE_CONNECTOME_BASE ?? "/connectome/",
);
const SOMA_BASE = String(
  import.meta.env.VITE_SOMA_BASE ?? "/connectome/",
);

let nextObject = 1;
let nextFly = 1;
let nextCheckpoint = 1;
let frameSubscribers = 0;
let checkpoints: Checkpoint[] = [];

let t = 0;
let running = false;
let resumeWhenReady = false;
let speed = 1;
let speedAccumulator = 0;

let connectomeMeta: ConnectomeMeta | null = null;
let connectomeWeights: ConnectomeWeights | null = null;
let neuralGroups: NeuralGroups | null = null;
let runtimeStatus: "loading" | "ready" | "error" = "loading";
let runtimeProgress = "waiting";
let runtimeError: string | null = null;
let runtimeWeightsMb = 0;

type SomaStore = {
  n: number;
  mapped: number;
  coords: Uint16Array;
  sample: [number, number, number, number][];
};

let somaStore: SomaStore | null = null;

let world: Frame["world"] = makeWorld(64);
let flies: LocalFly[] = [makeFly("prime", "PRIME", true, "fly", 64)];
let events: Frame["events"] = [
  {
    t: 0,
    kind: "system",
    message: "Browser worker started; loading the real MaleCNS connectome.",
  },
];
let couplings: Frame["couplings"] = [];
let achievements: Frame["achievements"] = [];
let mysterySecret: MysterySecret | null = null;
let historyState: BrowserHistoryState | null = null;
let challenge: ChallengeState = challengeState("sandbox");
const neural = new Map<string, NeuralState>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(value: number, low = 0, high = 1) {
  return Math.min(high, Math.max(low, value));
}

function wrapAngle(value: number) {
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function hashString(value: string) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uid(prefix: string, counter: number) {
  return `${prefix}-${counter.toString(36)}`;
}

function somaPoint(neuronId: number): [number, number, number, number] | null {
  if (!somaStore || neuronId < 0 || neuronId >= somaStore.n) return null;
  const offset = neuronId * 3;
  const x = somaStore.coords[offset];
  const y = somaStore.coords[offset + 1];
  const z = somaStore.coords[offset + 2];
  if (x === 65535 || y === 65535 || z === 65535) return null;
  return [neuronId, x / 65534, y / 65534, z / 65534];
}

function buildSomaSample(store: SomaStore, limit = 3500) {
  const valid: number[] = [];
  for (let neuronId = 0; neuronId < store.n; neuronId++) {
    const offset = neuronId * 3;
    if (
      store.coords[offset] !== 65535 &&
      store.coords[offset + 1] !== 65535 &&
      store.coords[offset + 2] !== 65535
    ) {
      valid.push(neuronId);
    }
  }

  if (valid.length <= limit) {
    return valid.map((id) => somaPoint(id)!).filter(Boolean);
  }

  const out: [number, number, number, number][] = [];
  for (let i = 0; i < limit; i++) {
    const pick = Math.floor((i * (valid.length - 1)) / Math.max(1, limit - 1));
    const point = somaPoint(valid[pick]);
    if (point) out.push(point);
  }
  return out;
}

async function loadSoma(base: string): Promise<SomaStore | null> {
  try {
    const somaUrl = `${base.endsWith("/") ? base : `${base}/`}soma.bin`;
    const response = await fetch(somaUrl, {
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 16) return null;

    const bytes = new Uint8Array(buffer);
    if (
      bytes[0] !== 0x46 ||
      bytes[1] !== 0x4c ||
      bytes[2] !== 0x59 ||
      bytes[3] !== 0x53
    ) {
      return null;
    }

    const view = new DataView(buffer);
    const version = view.getUint32(4, true);
    const n = view.getUint32(8, true);
    const mapped = view.getUint32(12, true);
    if (version !== 1 || n !== EXPECTED_NEURONS) return null;

    const expected = 16 + n * 3 * 2;
    if (buffer.byteLength !== expected) return null;

    const coords = new Uint16Array(buffer, 16, n * 3);
    const store: SomaStore = { n, mapped, coords, sample: [] };
    somaStore = store;
    store.sample = buildSomaSample(store);
    return store;
  } catch {
    return null;
  }
}

function firingSomaPositions(
  fired: Int32Array,
  limit = 512,
): [number, number, number, number][] {
  if (!somaStore || fired.length === 0) return [];
  const out: [number, number, number, number][] = [];
  const stride = Math.max(1, Math.floor(fired.length / limit));
  for (let i = 0; i < fired.length && out.length < limit; i += stride) {
    const point = somaPoint(fired[i]);
    if (point) out.push(point);
  }
  return out;
}


function makeWorld(seed: number): Frame["world"] {
  return {
    seed,
    daylight: 1,
    wind_x: 0,
    wind_y: 0,
    objects: [
      {
        id: uid("obj", nextObject++),
        kind: "food",
        x: 0.78,
        y: 0.28,
        intensity: 0.9,
        radius: 0.027,
        amount: 1,
        vx: 0,
        vy: 0,
        label: "fruit",
      },
      {
        id: uid("obj", nextObject++),
        kind: "stimulus",
        x: 0.2,
        y: 0.72,
        intensity: 0.8,
        radius: 0.035,
        amount: 1,
        vx: 0,
        vy: 0,
        label: "target",
      },
    ],
  };
}

function makeFly(
  id: string,
  name: string,
  isPrime: boolean,
  bodyType: BodyType,
  seed: number,
): LocalFly {
  const offset = isPrime ? 0 : ((nextFly % 5) - 2) * 0.025;
  return {
    id,
    name,
    is_prime: isPrime,
    body_type: bodyType,
    controller: "play",
    state: "IDLE",
    alive: true,
    x: clamp(0.5 + offset, 0.08, 0.92),
    y: clamp(0.5 - offset, 0.08, 0.92),
    heading: 0,
    speed: 0,
    energy: 72,
    hunger: 0.28,
    food_eaten: 0,
    escape_events: 0,
    fired_count: 0,
    firing_fraction: 0,
    newly_firing: 0,
    firing_jaccard_distance: 0,
    dn_activity: 0,
    dn_fired: 0,
    motor: {},
    senses: {},
    assists: {},
    trail: [],
    sampled_fired: [],
    brain_view: {
      kind: "unavailable",
      mapped: 0,
      firing_positions: [],
    },
    interventions: [],
    seed,
    sensoryGain: 1,
    manualTurn: 0,
    manualThrottle: 0,
    manualUntil: -1,
    touchSide: null,
    previousOdor: 0,
    lastEscape: 0,
    silenced: [],
    lesionFraction: 0,
  };
}

function publicFly(fly: LocalFly): FlyFrame {
  const {
    seed: _seed,
    sensoryGain: _sensoryGain,
    manualTurn: _manualTurn,
    manualThrottle: _manualThrottle,
    manualUntil: _manualUntil,
    touchSide: _touchSide,
    previousOdor: _previousOdor,
    lastEscape: _lastEscape,
    silenced: _silenced,
    lesionFraction,
    ...publicState
  } = fly;
  const visible = clone(publicState);
  if (
    challenge.id === "mystery" &&
    challenge.secret_hidden &&
    mysterySecret?.fly_id === fly.id
  ) {
    visible.interventions = visible.interventions.filter(
      (item) => item.hidden !== true,
    );
  }
  return {
    ...visible,
    lesion_fraction: lesionFraction,
  };
}

function challengeState(id: string): ChallengeState {
  const spec = CHALLENGES[id] ?? CHALLENGES.sandbox;
  return {
    id,
    name: spec.name,
    description: spec.description,
    goal: spec.goal,
    target: spec.target,
    budget: spec.budget,
    started: t,
    elapsed: 0,
    completed: false,
    winner: null,
    actions: 0,
    secret_hidden: false,
    history: null,
  };
}

function addEvent(kind: string, message: string) {
  events.push({ t, kind, message });
  if (events.length > 160) events = events.slice(-160);
}

function unlockAchievement(key: string, title: string, description: string) {
  if (achievements.some((item) => item.key === key)) return;
  achievements.push({ key, title, description });
}

function buildGroups(meta: ConnectomeMeta): NeuralGroups {
  const populations: Record<string, Int32Array> = {};
  for (const name of KNOWN_POPS) populations[name] = cells(meta, [name]);

  const visual = {
    loom: {
      L: cells(meta, ["LPLC2"], "L"),
      R: cells(meta, ["LPLC2"], "R"),
    },
    threat: {
      L: cells(meta, ["LC4"], "L"),
      R: cells(meta, ["LC4"], "R"),
    },
    small: {
      L: cells(meta, ["LPLC1"], "L"),
      R: cells(meta, ["LPLC1"], "R"),
    },
    target: {
      L: cells(meta, ["LC10a"], "L"),
      R: cells(meta, ["LC10a"], "R"),
    },
  };

  const touch = {
    L: cellsWithPrefix(meta, ["SNta"], "L"),
    R: cellsWithPrefix(meta, ["SNta"], "R"),
  };

  const motor: Record<string, Int32Array> = {};
  const motorTypes: Record<string, string> = {
    forward: "DNg100",
    steer: "DNa02",
    escape: "DNp01",
    backward: "MDN",
  };
  for (const [role, cellType] of Object.entries(motorTypes)) {
    motor[role] = cells(meta, [cellType]);
    motor[`${role}_L`] = cells(meta, [cellType], "L");
    motor[`${role}_R`] = cells(meta, [cellType], "R");
  }

  return {
    populations,
    orn: cells(meta, ["ORN_DM1", "ORN_DM2"]),
    hearing: cellsWithPrefix(meta, ["JO-A", "JO-B"]),
    visual,
    touch,
    motor,
    dn: cells(meta, ["descending_neuron"]),
  };
}

function createNeuralState(seed: number): NeuralState {
  if (!connectomeMeta || !connectomeWeights || !neuralGroups) {
    throw new Error("Connectome is not ready");
  }

  const motorSmooth: Record<string, number> = {};
  for (const key of Object.keys(neuralGroups.motor)) motorSmooth[key] = 0;

  return {
    brain: new ConnectomeBrain(connectomeWeights, connectomeMeta.params, seed),
    previousFired: new Int32Array(0),
    dnTrace: 0,
    motorSmooth,
    previousSize: {},
    pending: [],
    silenced: new Set(),
    blocked: null,
  };
}

function attachNeural(fly: LocalFly) {
  if (runtimeStatus !== "ready") return;
  neural.set(fly.id, createNeuralState(fly.seed));
}

function rebuildBlocked(state: NeuralState) {
  if (!neuralGroups || state.silenced.size === 0) {
    state.blocked = null;
    return;
  }

  const mask = new Uint8Array(connectomeMeta!.n);
  for (const name of state.silenced) {
    const idx = neuralGroups.populations[name];
    if (!idx) continue;
    for (let i = 0; i < idx.length; i++) mask[idx[i]] = 1;
  }
  state.blocked = mask;
}

async function bootConnectome() {
  runtimeStatus = "loading";
  runtimeProgress = "connectome manifest";
  runtimeError = null;
  emitFrame();

  try {
    const somaPromise = loadSoma(SOMA_BASE);
    const loaded = await loadConnectome(CONNECTOME_BASE, (progress) => {
      runtimeProgress = progress;
      emitFrame();
    });

    const soma = await somaPromise;
    somaStore = soma;

    connectomeMeta = loaded.meta;
    connectomeWeights = loaded.weights;
    neuralGroups = buildGroups(loaded.meta);
    runtimeWeightsMb = loaded.info.weights_mb;

    if (
      loaded.meta.n !== EXPECTED_NEURONS ||
      loaded.weights.nnz <= 20_000_000
    ) {
      throw new Error(
        `Unexpected connectome dimensions: ${loaded.meta.n} neurons / ${loaded.weights.nnz} synapses`,
      );
    }

    runtimeStatus = "ready";
    runtimeProgress = "ready";

    neural.clear();
    for (const fly of flies) attachNeural(fly);
    addEvent(
      "system",
      `Real browser FlyBrain ready: ${loaded.meta.n.toLocaleString()} neurons / ${loaded.weights.nnz.toLocaleString()} synapses.`,
    );
    if (somaStore) {
      addEvent(
        "system",
        `3D anatomy ready: ${somaStore.mapped.toLocaleString()} real MaleCNS soma positions.`,
      );
    } else {
      addEvent(
        "system",
        "3D anatomy asset not found at /connectome/soma.bin; the neural simulation will continue without spatial anatomy.",
      );
    }

    if (resumeWhenReady) running = true;
    emitFrame();
  } catch (error) {
    runtimeStatus = "error";
    runtimeError = error instanceof Error ? error.message : String(error);
    runtimeProgress = "failed";
    running = false;
    addEvent("error", `Connectome load failed: ${runtimeError}`);
    scope.postMessage({
      type: "error",
      message:
        "The real browser connectome could not be loaded. The sandbox is paused instead of silently falling back to fake neural activity.",
    });
    emitFrame();
  }
}

function metadata(): Metadata {
  const n = connectomeMeta?.n ?? EXPECTED_NEURONS;
  const nnz = connectomeWeights?.nnz ?? EXPECTED_SYNAPSES;

  return {
    neurons: n,
    synapses: nnz,
    dt: connectomeMeta?.params.dt ?? DT,
    max_flies: MAX_FLIES,
    mock: runtimeStatus !== "ready",
    bodies: BODIES,
    challenges: CHALLENGES,
    provenance: {
      graph: {
        label: "CONNECTOME DATA",
        description:
          "MaleCNS v1.0 graph and neuron labels loaded as FlyBrain's compact browser export.",
      },
      dynamics: {
        label: "SIMULATED NEURAL DYNAMICS",
        description:
          "Leaky integrate-and-fire stepping runs inside this browser Web Worker; no hosted CPU performs neural steps.",
      },
      compression: {
        label: "WEB GRAPH ENCODING",
        description:
          "The browser export log-quantizes signed synaptic weights to one byte per edge; topology remains the MaleCNS graph.",
      },
    },
    sensory_provenance: {},
    motor_provenance: {},
    motor_mapping:
      "DNg100 forward, DNa02 steering, DNp01 escape and MDN backward; movement is an explicit engineering decoder.",
  };
}

function relative(fly: LocalFly, obj: ArenaObject) {
  const dx = obj.x - fly.x;
  const dy = obj.y - fly.y;
  const distance = Math.max(1e-4, Math.hypot(dx, dy));
  return {
    distance,
    bearing: wrapAngle(Math.atan2(dy, dx) - fly.heading),
    angularSize: Math.min(1.5, obj.radius / distance),
  };
}

function sensorySnapshot(fly: LocalFly): SensorySnapshot {
  const visual: SensoryItem[] = [];
  const food: SensoryItem[] = [];
  const sound: SensoryItem[] = [];
  const obstacles: SensoryItem[] = [];

  for (const obj of world.objects) {
    const rel = relative(fly, obj);

    if (obj.kind === "food" || obj.kind === "odor") {
      const drive = Math.min(
        0.8,
        (obj.intensity * obj.amount) /
          (0.12 + 5 * rel.distance * rel.distance),
      );
      const item = { object: obj, ...rel, drive };
      food.push(item);
      if (obj.kind === "food") visual.push(item);
    } else if (
      obj.kind === "stimulus" ||
      obj.kind === "loom" ||
      obj.kind === "predator" ||
      obj.kind === "light" ||
      obj.kind === "goal"
    ) {
      const drive = Math.min(
        0.8,
        obj.intensity / (1 + 2.5 * rel.distance),
      );
      visual.push({ object: obj, ...rel, drive });
    } else if (obj.kind === "sound") {
      const pulse =
        0.5 +
        0.5 *
          Math.sin(2 * Math.PI * Math.max(0.25, obj.amount) * t);
      const drive = Math.min(
        0.8,
        (obj.intensity * pulse) / (0.2 + 3 * rel.distance),
      );
      sound.push({ object: obj, ...rel, drive });
    } else if (obj.kind === "obstacle") {
      const clearance = Math.max(0, rel.distance - obj.radius);
      const drive = Math.max(0, 1 - clearance / 0.24);
      obstacles.push({ object: obj, ...rel, drive, clearance });
    }
  }

  return { visual, food, sound, obstacles };
}

function sideForBearing(bearing: number): Side {
  return bearing < 0 ? "L" : "R";
}

function encodeSensory(
  fly: LocalFly,
  state: NeuralState,
  snapshot: SensorySnapshot,
) {
  if (!neuralGroups) throw new Error("Connectome groups unavailable");

  const display: Record<string, number> = {
    food_odor: 0,
    target: 0,
    obstacle: 0,
    loom: 0,
    threat: 0,
    touch: 0,
    sound: 0,
    light: 0,
  };

  const hunger = clamp(1 - fly.energy / 100);
  const hungerGain = 0.45 + 1.35 * hunger;
  const sensoryGain = fly.sensoryGain;

  const odor = Math.max(0, ...snapshot.food.map((item) => item.drive));
  if (odor > 0 && neuralGroups.orn.length) {
    const amount = clamp(odor * sensoryGain * hungerGain, 0, 0.8);
    state.brain.stimulate(neuralGroups.orn, amount);
    display.food_odor = amount;
  }

  const currentSizes: Record<string, number> = {};
  for (const item of snapshot.visual) {
    const obj = item.object;
    const side = sideForBearing(item.bearing);
    const size = item.angularSize;
    currentSizes[obj.id] = size;
    const previous = state.previousSize[obj.id] ?? size;
    const growth = Math.max(0, size - previous);

    if (obj.kind === "loom" || obj.kind === "predator") {
      const loom = clamp(growth * 10 + size * 0.08, 0, 0.8);
      if (loom > 0) {
        state.brain.stimulate(
          neuralGroups.visual.loom[side],
          loom * sensoryGain,
        );
        display.loom = Math.max(display.loom, loom);
      }

      const threat = clamp((0.18 - item.distance) * 5, 0, 0.8);
      if (threat > 0) {
        state.brain.stimulate(
          neuralGroups.visual.threat[side],
          threat * sensoryGain,
        );
        display.threat = Math.max(display.threat, threat);
      }
    } else if (
      obj.kind === "stimulus" ||
      obj.kind === "goal" ||
      obj.kind === "food"
    ) {
      const target = clamp(0.25 + size * 0.9, 0, 0.8);
      state.brain.stimulate(
        neuralGroups.visual.target[side],
        target * sensoryGain,
      );
      display.target = Math.max(display.target, target);
    } else if (obj.kind === "light") {
      // The compact upstream web export does not carry photoreceptor azimuth
      // metadata yet. Keep the UI channel explicit instead of inventing an input.
      display.light = Math.max(display.light, item.drive);
    }
  }
  state.previousSize = currentSizes;

  for (const item of snapshot.obstacles) {
    if (Math.abs(item.bearing) > 1.55) continue;
    const side = sideForBearing(item.bearing);
    const clearance = item.clearance ?? item.distance;
    const approach = clamp((0.24 - clearance) / 0.24);
    const smallDrive = clamp(
      approach * 0.65 + item.angularSize * 0.2,
      0,
      0.8,
    );
    if (smallDrive > 0) {
      state.brain.stimulate(
        neuralGroups.visual.small[side],
        smallDrive * sensoryGain,
      );
      display.obstacle = Math.max(display.obstacle, smallDrive);
    }
  }

  if (fly.touchSide) {
    state.brain.stimulate(
      neuralGroups.touch[fly.touchSide],
      0.55 * sensoryGain,
    );
    display.touch = 0.55;
  }

  const soundDrive = Math.max(0, ...snapshot.sound.map((item) => item.drive));
  display.sound = clamp(soundDrive * sensoryGain, 0, 0.8);
  if (display.sound > 0 && neuralGroups.hearing.length) {
    state.brain.stimulate(neuralGroups.hearing, display.sound);
  }

  for (const pending of state.pending) {
    state.brain.stimulate(pending.idx, pending.amount);
  }
  state.pending = [];

  return display;
}

function countIntersection(a: Int32Array, b: Int32Array) {
  let i = 0;
  let j = 0;
  let count = 0;
  while (i < a.length && j < b.length) {
    const av = a[i];
    const bv = b[j];
    if (av === bv) {
      count++;
      i++;
      j++;
    } else if (av < bv) {
      i++;
    } else {
      j++;
    }
  }
  return count;
}

function jaccardAndNew(previous: Int32Array, current: Int32Array) {
  let i = 0;
  let j = 0;
  let intersection = 0;
  let newly = 0;

  while (i < previous.length && j < current.length) {
    const a = previous[i];
    const b = current[j];
    if (a === b) {
      intersection++;
      i++;
      j++;
    } else if (a < b) {
      i++;
    } else {
      newly++;
      j++;
    }
  }
  newly += current.length - j;

  const union = previous.length + current.length - intersection;
  return {
    jaccard: union ? 1 - intersection / union : 0,
    newly,
  };
}

function observeMotor(state: NeuralState, fired: Int32Array) {
  if (!neuralGroups || !connectomeMeta) return {};

  const alpha = 0.28;
  for (const [name, idx] of Object.entries(neuralGroups.motor)) {
    const count = countIntersection(fired, idx);
    const hz =
      count /
      Math.max(1, idx.length) /
      Math.max(connectomeMeta.params.dt, 1e-6);
    state.motorSmooth[name] += alpha * (hz - state.motorSmooth[name]);
  }

  return { ...state.motorSmooth };
}

function decodeMotor(motor: Record<string, number>, controller: Controller) {
  const steerDiff =
    (motor.steer_L ?? 0) - (motor.steer_R ?? 0);
  const turn = clamp(steerDiff * 0.09, -3, 3);

  const forwardHz = Math.max(0, (motor.forward ?? 0) - 0.7);
  const backwardHz = Math.max(0, (motor.backward ?? 0) - 0.7);
  const neuralSpeed = clamp(
    (forwardHz - backwardHz) * 0.018,
    -0.14,
    0.16,
  );

  const base = controller === "play" ? 0.035 : 0;
  let decodedSpeed = clamp(base + neuralSpeed, -0.14, 0.18);

  const escape = clamp(((motor.escape ?? 0) - 2) / 16);
  if (escape > 0) {
    decodedSpeed = Math.max(decodedSpeed, 0.08 + 0.12 * escape);
  }

  return { turn, speed: decodedSpeed, escape };
}

function playAssists(
  fly: LocalFly,
  snapshot: SensorySnapshot,
  escape: number,
) {
  const zero = {
    forage: 0,
    avoid: 0,
    obstacle: 0,
    edge: 0,
    target: 0,
    orient: 0,
    search: 0,
  };

  if (fly.controller !== "play") {
    return { turn: 0, speed: 0, assists: zero };
  }

  const hunger = clamp(1 - fly.energy / 100);
  const odor = Math.max(0, ...snapshot.food.map((item) => item.drive));

  let forageTurn = 0;
  if (snapshot.food.length && hunger > 0.15) {
    const strongest = snapshot.food.reduce((a, b) =>
      a.drive >= b.drive ? a : b,
    );
    forageTurn = clamp(
      strongest.bearing * strongest.drive * hunger * 2.6,
      -1.25,
      1.25,
    );
  }

  const threats = snapshot.visual.filter((item) =>
    ["predator", "loom"].includes(item.object.kind),
  );
  let avoidTurn = 0;
  let threatStrength = 0;
  if (threats.length) {
    const nearest = threats.reduce((a, b) =>
      a.distance <= b.distance ? a : b,
    );
    threatStrength = clamp((0.52 - nearest.distance) / 0.52);
    let bearing = nearest.bearing;
    if (Math.abs(bearing) < 0.08) {
      bearing =
        (fly.seed + Math.floor(t * 10)) % 2 === 0 ? 0.08 : -0.08;
    }
    avoidTurn = clamp(
      -bearing * threatStrength * 3.8,
      -2.25,
      2.25,
    );
  }

  const ahead = snapshot.obstacles.filter(
    (item) =>
      Math.abs(item.bearing) < 1.45 &&
      (item.clearance ?? item.distance) < 0.24,
  );
  let obstacleTurn = 0;
  let obstacleStrength = 0;
  if (ahead.length) {
    const nearest = ahead.reduce((a, b) =>
      (a.clearance ?? a.distance) <= (b.clearance ?? b.distance)
        ? a
        : b,
    );
    const clearance = nearest.clearance ?? nearest.distance;
    let bearing = nearest.bearing;
    obstacleStrength = clamp((0.24 - clearance) / 0.24);
    if (Math.abs(bearing) < 0.1) {
      bearing =
        (Math.floor(fly.seed / 3) + Math.floor(t * 5)) % 2 === 0
          ? 0.1
          : -0.1;
    }
    obstacleTurn = clamp(
      -bearing * (1.15 + obstacleStrength * 3.2),
      -2.6,
      2.6,
    );
  }

  let edgeTurn = 0;
  let edgeStrength = 0;
  const vx = Math.cos(fly.heading);
  const vy = Math.sin(fly.heading);
  const edgeDistances: Array<[number, boolean]> = [
    [fly.x, vx < 0],
    [1 - fly.x, vx > 0],
    [fly.y, vy < 0],
    [1 - fly.y, vy > 0],
  ];
  const outward = edgeDistances
    .filter(([, active]) => active)
    .map(([distance]) => distance);
  if (outward.length) {
    const nearest = Math.min(...outward);
    edgeStrength = clamp((0.12 - nearest) / 0.12);
    if (edgeStrength > 0) {
      const desired = Math.atan2(0.5 - fly.y, 0.5 - fly.x);
      const delta = wrapAngle(desired - fly.heading);
      edgeTurn = clamp(
        delta * (0.9 + 2.4 * edgeStrength),
        -2.7,
        2.7,
      );
    }
  }

  const targets = snapshot.visual.filter((item) =>
    ["stimulus", "goal"].includes(item.object.kind),
  );
  let targetTurn = 0;
  let targetDrive = 0;
  let targetDistance = 1;
  if (targets.length) {
    const strongest = targets.reduce((a, b) =>
      a.drive / Math.max(0.06, a.distance) >=
      b.drive / Math.max(0.06, b.distance)
        ? a
        : b,
    );
    targetDrive = strongest.drive;
    targetDistance = strongest.distance;
    targetTurn = clamp(
      strongest.bearing * (0.8 + targetDrive * 3),
      -1.65,
      1.65,
    );
  }

  const orientCandidates = [
    ...snapshot.visual.filter((item) => item.object.kind === "light"),
    ...snapshot.sound,
  ];
  let orientTurn = 0;
  let orientDrive = 0;
  if (orientCandidates.length) {
    const strongest = orientCandidates.reduce((a, b) =>
      a.drive >= b.drive ? a : b,
    );
    orientDrive = strongest.drive;
    orientTurn = clamp(
      strongest.bearing * orientDrive * 0.9,
      -0.65,
      0.65,
    );
  }

  let search =
    Math.sin(t * 0.71 + (fly.seed % 31) * 0.17) *
    (0.3 + 0.3 * hunger);
  const cueStrength = Math.max(
    odor,
    targetDrive,
    orientDrive * 0.6,
    threatStrength,
    obstacleStrength,
    edgeStrength,
  );
  search *= Math.max(0.05, 1 - cueStrength * 1.45);
  if (odor > fly.previousOdor) search *= 0.35;
  fly.previousOdor = odor;

  let touchTurn = 0;
  if (fly.touchSide === "L") touchTurn = 2.5;
  else if (fly.touchSide === "R") touchTurn = -2.5;

  let assistSpeed = 0.024 + hunger * 0.042;
  if (targetDrive > 0) {
    assistSpeed += 0.035 * targetDrive;
    if (targetDistance < 0.055) assistSpeed *= 0.35;
  }
  if (obstacleStrength > 0.55 || edgeStrength > 0.55) {
    assistSpeed *= 0.65;
  }
  if (escape > 0.2) assistSpeed += 0.08 * escape;

  let totalTurn: number;
  if (Math.abs(touchTurn) > 0) totalTurn = touchTurn;
  else if (Math.abs(avoidTurn) > 0.15)
    totalTurn = avoidTurn + search * 0.08;
  else if (Math.abs(obstacleTurn) > 0.1)
    totalTurn = obstacleTurn + search * 0.05;
  else if (Math.abs(edgeTurn) > 0.1)
    totalTurn = edgeTurn + search * 0.05;
  else
    totalTurn =
      targetTurn + forageTurn + orientTurn + search;

  return {
    turn: totalTurn,
    speed: assistSpeed,
    assists: {
      forage: forageTurn,
      avoid: avoidTurn,
      obstacle: obstacleTurn + touchTurn,
      edge: edgeTurn,
      target: targetTurn,
      orient: orientTurn,
      search,
    },
  };
}

function stepNeural(
  fly: LocalFly,
  state: NeuralState,
  snapshot: SensorySnapshot,
) {
  if (!neuralGroups || !connectomeMeta) {
    throw new Error("Connectome is not ready");
  }

  const senses = encodeSensory(fly, state, snapshot);
  state.brain.step();
  const firedView = state.brain.filterFired(state.blocked);
  const fired = Int32Array.from(firedView);

  const dnFired = countIntersection(fired, neuralGroups.dn);
  const traceDecay = Math.exp(-connectomeMeta.params.dt / 0.1);
  state.dnTrace =
    state.dnTrace * traceDecay +
    dnFired / Math.max(1, neuralGroups.dn.length);

  const motor = observeMotor(state, fired);
  const decoded = decodeMotor(motor, fly.controller);
  const delta = jaccardAndNew(state.previousFired, fired);
  state.previousFired = fired;

  return {
    senses,
    motor,
    ...decoded,
    fired,
    dnFired,
    dnActivity: state.dnTrace,
    jaccard: delta.jaccard,
    newly: delta.newly,
  };
}

function updateMovingObjects(stepDt: number) {
  for (const obj of world.objects) {
    if (!obj.vx && !obj.vy) continue;

    obj.x += obj.vx * stepDt;
    obj.y += obj.vy * stepDt;

    if (obj.x < obj.radius || obj.x > 1 - obj.radius) {
      obj.vx *= -1;
      obj.x = clamp(obj.x, obj.radius, 1 - obj.radius);
    }

    if (obj.y < obj.radius || obj.y > 1 - obj.radius) {
      obj.vy *= -1;
      obj.y = clamp(obj.y, obj.radius, 1 - obj.radius);
    }
  }
}

function bounceBounds(
  x: number,
  y: number,
  heading: number,
): [number, number, number, boolean] {
  const padding = 0.02;
  let bounced = false;

  if (x < padding) {
    x = padding + 0.002;
    heading = Math.PI - heading;
    bounced = true;
  } else if (x > 1 - padding) {
    x = 1 - padding - 0.002;
    heading = Math.PI - heading;
    bounced = true;
  }

  if (y < padding) {
    y = padding + 0.002;
    heading = -heading;
    bounced = true;
  } else if (y > 1 - padding) {
    y = 1 - padding - 0.002;
    heading = -heading;
    bounced = true;
  }

  return [x, y, ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), bounced];
}

function collide(
  fly: LocalFly,
  x: number,
  y: number,
  oldX: number,
  oldY: number,
) {
  for (const obj of world.objects) {
    if (obj.kind !== "obstacle") continue;
    const dx = obj.x - x;
    const dy = obj.y - y;
    if (Math.hypot(dx, dy) >= obj.radius + 0.018) continue;

    const rel = wrapAngle(Math.atan2(dy, dx) - fly.heading);
    return {
      x: oldX,
      y: oldY,
      touch: (rel < 0 ? "L" : "R") as Side,
    };
  }

  return {
    x: clamp(x, 0.02, 0.98),
    y: clamp(y, 0.02, 0.98),
    touch: null,
  };
}

function feed(fly: LocalFly) {
  for (const obj of [...world.objects]) {
    if (obj.kind !== "food") continue;
    if (Math.hypot(fly.x - obj.x, fly.y - obj.y) >= obj.radius + 0.028)
      continue;

    const eaten = Math.min(obj.amount, 0.004);
    obj.amount -= eaten;
    const finished = obj.amount <= 1e-6;
    if (finished) {
      world.objects = world.objects.filter((item) => item.id !== obj.id);
    }
    return { feeding: true, eaten, finished };
  }

  return { feeding: false, eaten: 0, finished: false };
}

function predatorHit(fly: LocalFly) {
  return world.objects.some(
    (obj) =>
      obj.kind === "predator" &&
      Math.hypot(fly.x - obj.x, fly.y - obj.y) <
        obj.radius + 0.02,
  );
}

function stepFly(fly: LocalFly, stepDt: number) {
  if (!fly.alive) return;
  const state = neural.get(fly.id);
  if (!state) return;

  const snapshot = sensorySnapshot(fly);
  const previousTouch = fly.touchSide;
  const result = stepNeural(fly, state, snapshot);

  // The tactile input above is from the previous collision, matching the
  // server runtime. Clear it before calculating this step's new collision.
  fly.touchSide = null;

  const assist = playAssists(fly, snapshot, result.escape);
  let turn = result.turn + assist.turn;
  let decodedSpeed = result.speed + assist.speed;

  if (t <= fly.manualUntil) {
    turn += fly.manualTurn * 3;
    decodedSpeed += fly.manualThrottle * 0.14;
    fly.state = "POSSESSED";
  }

  if (result.escape > 0.45 && fly.lastEscape <= 0.45) {
    fly.escape_events += 1;
  }
  fly.lastEscape = result.escape;

  if (fly.body_type === "synth") decodedSpeed = 0;
  else decodedSpeed *= BODY_SPEED[fly.body_type];

  const oldX = fly.x;
  const oldY = fly.y;
  fly.heading =
    ((fly.heading + turn * stepDt) % (2 * Math.PI) + 2 * Math.PI) %
    (2 * Math.PI);
  fly.speed = clamp(decodedSpeed, -0.24, 0.28);

  let nx = fly.x + Math.cos(fly.heading) * fly.speed * stepDt;
  let ny = fly.y + Math.sin(fly.heading) * fly.speed * stepDt;
  if (fly.body_type !== "synth") {
    nx += world.wind_x * stepDt;
    ny += world.wind_y * stepDt;
  }

  let bouncedHeading: number;
  let bounced: boolean;
  [nx, ny, bouncedHeading, bounced] = bounceBounds(nx, ny, fly.heading);
  if (bounced) {
    const jitter = ((fly.seed % 17) - 8) * 0.003;
    fly.heading =
      ((bouncedHeading + jitter) % (2 * Math.PI) + 2 * Math.PI) %
      (2 * Math.PI);
  }

  const collision = collide(fly, nx, ny, oldX, oldY);
  fly.x = collision.x;
  fly.y = collision.y;
  fly.touchSide = collision.touch;

  const feeding = feed(fly);
  if (feeding.feeding && result.escape < 0.2) {
    fly.speed = 0;
    fly.x = oldX;
    fly.y = oldY;
    fly.energy = Math.min(100, fly.energy + feeding.eaten * 70);
    if (feeding.finished) {
      fly.food_eaten += 1;
      addEvent("behavior", `${fly.name} finished a fruit.`);
      unlockAchievement("first_bite", "FIRST BITE", "A fly ate food.");
    }
    fly.state = "FEEDING";
  } else if (result.escape > 0.35) {
    fly.state = "ESCAPING";
  } else if (bounced) {
    fly.state = "BOUNCING";
  } else if (Math.abs(assist.assists.avoid) > 0.12) {
    fly.state = "EVADING";
  } else if (Math.abs(assist.assists.obstacle) > 0.1) {
    fly.state = "AVOIDING WALL";
  } else if (Math.abs(assist.assists.edge) > 0.1) {
    fly.state = "TURNING INWARD";
  } else if (Math.abs(assist.assists.target) > 0.08) {
    fly.state = "SEEKING TARGET";
  } else if (Math.abs(assist.assists.forage) > 0.06) {
    fly.state = "FORAGING";
  } else if (Math.abs(assist.assists.orient) > 0.05) {
    fly.state = "ORIENTING";
  } else if (fly.speed < -0.015) {
    fly.state = "REVERSING";
  } else if (Math.abs(fly.speed) > 0.02) {
    fly.state = "EXPLORING";
  } else if (t > fly.manualUntil) {
    fly.state = "IDLE";
  }

  const drain = 0.0018 + Math.abs(fly.speed) * 0.012;
  fly.energy = Math.max(0, fly.energy - drain);
  fly.hunger = clamp(1 - fly.energy / 100);

  if (fly.energy <= 0) {
    fly.alive = false;
    fly.state = "OUT OF ENERGY";
  }

  if (predatorHit(fly)) {
    fly.alive = false;
    fly.energy = 0;
    fly.hunger = 1;
    fly.state = "CAUGHT";
    addEvent("behavior", `${fly.name} was caught by the predator.`);
  }

  fly.motor = result.motor;
  fly.senses = result.senses;
  fly.assists = assist.assists;
  fly.fired_count = result.fired.length;
  fly.firing_fraction =
    result.fired.length / Math.max(1, connectomeMeta?.n ?? EXPECTED_NEURONS);
  fly.newly_firing = result.newly;
  fly.firing_jaccard_distance = result.jaccard;
  fly.dn_activity = result.dnActivity;
  fly.dn_fired = result.dnFired;
  fly.sampled_fired = Array.from(result.fired.subarray(0, 256));
  fly.brain_view = {
    kind: somaStore ? "anatomical" : "real-connectome-no-soma-web-export",
    mapped: somaStore?.mapped ?? 0,
    firing_positions: firingSomaPositions(result.fired),
  };

  if (t - (fly.trail.at(-1)?.t ?? -Infinity) >= 0.08) {
    fly.trail.push({ t, x: fly.x, y: fly.y });
    if (fly.trail.length > 180) fly.trail = fly.trail.slice(-180);
  }

  if (result.escape > 0.45 && previousTouch !== fly.touchSide) {
    unlockAchievement(
      "escape_artist",
      "ESCAPE ARTIST",
      "Triggered a strong DNp01 escape response.",
    );
  }
}

function applyCouplings() {
  if (!neuralGroups) return;

  for (const link of couplings) {
    const source = flies.find((fly) => fly.id === link.source);
    const target = neural.get(link.target);
    const idx = neuralGroups.populations[link.population];
    if (!source || !target || !idx?.length) continue;

    const amount = clamp(source.dn_activity * link.gain, 0, 0.8);
    if (amount > 0) target.pending.push({ idx, amount });
  }
}

function advance() {
  if (runtimeStatus !== "ready") return;

  applyCouplings();
  updateMovingObjects(DT);
  for (const fly of flies) stepFly(fly, DT);
  t += DT;
  challenge.elapsed = Math.max(0, t - challenge.started);

  evaluateChallenge();
  advanceHistoryExperiment();

  if (flies.length >= 3) {
    unlockAchievement("party_box", "PARTY BOX", "Ran at least three agents together.");
  }
  if (flies.some((fly) => fly.energy < 25)) {
    unlockAchievement(
      "why_did_you_do_that",
      "WHY DID YOU DO THAT",
      "Dropped an agent below 25 energy.",
    );
  }
  if (t >= 60 && flies.some((fly) => fly.alive)) {
    unlockAchievement("survivor", "SURVIVOR", "Kept an agent alive for 60 simulated seconds.");
  }
}

function evaluateChallenge() {
  if (challenge.completed) return;

  if (
    challenge.goal === "food" &&
    flies.reduce((sum, fly) => sum + fly.food_eaten, 0) >=
      (challenge.target ?? 3)
  ) {
    completeChallenge(null);
  } else if (
    challenge.goal === "survive" &&
    challenge.target &&
    challenge.elapsed >= challenge.target &&
    flies.some((fly) => fly.alive)
  ) {
    completeChallenge(flies.find((fly) => fly.alive)?.name ?? null);
  } else if (
    challenge.goal === "dn_activity" &&
    flies.some(
      (fly) => fly.dn_activity >= (challenge.target ?? 0.12),
    )
  ) {
    completeChallenge(
      flies.find(
        (fly) => fly.dn_activity >= (challenge.target ?? 0.12),
      )?.name ?? null,
    );
  } else if (challenge.goal === "race") {
    const goal = world.objects.find(
      (obj) => obj.kind === "goal" || obj.kind === "stimulus",
    );
    if (goal) {
      const winner = flies.find(
        (fly) =>
          fly.alive &&
          Math.hypot(fly.x - goal.x, fly.y - goal.y) <
            goal.radius + 0.025,
      );
      if (winner) completeChallenge(winner.name);
    }
  } else if (challenge.goal === "first_food") {
    const winner = flies.find(
      (fly) => fly.food_eaten >= (challenge.target ?? 1),
    );
    if (winner) completeChallenge(winner.name);
  }
}

function completeChallenge(winner: string | null) {
  challenge.completed = true;
  challenge.winner = winner;
  addEvent(
    "challenge",
    winner
      ? `${winner} completed ${challenge.name}.`
      : `${challenge.name} completed.`,
  );
}

function comparisons(): Frame["comparisons"] {
  const rows: Frame["comparisons"] = [];

  for (let i = 0; i < flies.length; i++) {
    for (let j = i + 1; j < flies.length; j++) {
      const a = flies[i];
      const b = flies[j];
      const an = neural.get(a.id)?.previousFired ?? new Int32Array(0);
      const bn = neural.get(b.id)?.previousFired ?? new Int32Array(0);
      const intersection = countIntersection(an, bn);
      const union = an.length + bn.length - intersection;

      rows.push({
        a: a.id,
        b: b.id,
        a_name: a.name,
        b_name: b.name,
        neural_divergence: union ? 1 - intersection / union : 0,
        behavioral_divergence: Math.hypot(a.x - b.x, a.y - b.y),
        energy_delta: Math.abs(a.energy - b.energy),
      });
    }
  }

  return rows;
}

function framePayload(): Frame {
  challenge.secret_hidden =
    challenge.id === "mystery" && mysterySecret !== null && !challenge.completed;
  challenge.history =
    challenge.id === "history" && historyState ? clone(historyState) : null;

  return {
    type: "frame",
    t,
    running,
    speed,
    mock: runtimeStatus !== "ready",
    flies: flies.map(publicFly),
    world: clone(world),
    events: clone(events.slice(-40)),
    challenge: clone(challenge),
    achievements: clone(achievements),
    couplings: clone(couplings),
    comparisons: comparisons(),
    checkpoints: checkpoints.map(({ id, label, t: checkpointT }) => ({
      id,
      label,
      t: checkpointT,
    })),
    runtime: {
      mode: "browser",
      status: runtimeStatus,
      progress: runtimeProgress,
      error: runtimeError,
      connectome_base: CONNECTOME_BASE,
      neurons: connectomeMeta?.n ?? EXPECTED_NEURONS,
      synapses: connectomeWeights?.nnz ?? EXPECTED_SYNAPSES,
      download_mb: runtimeWeightsMb || undefined,
      weight_encoding: "FlyBrain web export · 8-bit log quantized",
    },
  };
}

function emitFrame() {
  if (frameSubscribers <= 0) return;
  scope.postMessage(framePayload());
}

function parsePath(rawPath: string) {
  const url = new URL(rawPath, "https://flybox.local");
  return { path: url.pathname, query: url.searchParams };
}

function findFly(id: string) {
  const fly = flies.find((item) => item.id === id);
  if (!fly) throw new Error(`Unknown fly: ${id}`);
  return fly;
}

function populationStatus(fly: LocalFly) {
  if (!neuralGroups) {
    return Object.entries(FALLBACK_POPULATIONS).map(([name, neurons]) => ({
      name,
      neurons,
      firing: 0,
      silenced: fly.silenced.includes(name),
    }));
  }

  const fired = neural.get(fly.id)?.previousFired ?? new Int32Array(0);
  const state = neural.get(fly.id);

  return KNOWN_POPS.map((name) => {
    const idx = neuralGroups!.populations[name];
    const hiddenMysterySilence =
      challenge.id === "mystery" &&
      challenge.secret_hidden &&
      mysterySecret?.fly_id === fly.id &&
      mysterySecret.target === name;
    return {
      name,
      neurons: idx.length,
      firing: countIntersection(fired, idx),
      silenced: hiddenMysterySilence
        ? false
        : state?.silenced.has(name) ?? false,
    };
  });
}

function snapshotNeural() {
  const out: Record<string, NeuralSnapshot> = {};

  for (const [id, state] of neural) {
    out[id] = {
      brain: state.brain.snapshot(),
      previousFired: state.previousFired.slice(),
      dnTrace: state.dnTrace,
      motorSmooth: { ...state.motorSmooth },
      previousSize: { ...state.previousSize },
      pending: state.pending.map((item) => ({
        idx: item.idx.slice(),
        amount: item.amount,
      })),
      silenced: [...state.silenced],
    };
  }

  return out;
}

function snapshot(): Snapshot {
  return {
    t,
    running,
    speed,
    world: clone(world),
    flies: clone(flies),
    events: clone(events),
    couplings: clone(couplings),
    achievements: clone(achievements),
    challenge: clone(challenge),
    mysterySecret: clone(mysterySecret),
    historyState: clone(historyState),
    neural: snapshotNeural(),
  };
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (
        item instanceof Float32Array ||
        item instanceof Int32Array ||
        item instanceof Uint8Array ||
        item instanceof Uint16Array ||
        item instanceof Uint32Array
      ) {
        return Array.from(item);
      }
      return item;
    }),
  ) as T;
}

function restore(data: Snapshot) {
  t = data.t;
  running = data.running && runtimeStatus === "ready";
  speed = data.speed;
  world = clone(data.world);
  flies = clone(data.flies);
  events = clone(data.events);
  couplings = clone(data.couplings);
  achievements = clone(data.achievements);
  challenge = clone(data.challenge);
  mysterySecret = clone(data.mysterySecret ?? null);
  historyState = clone(data.historyState ?? null);
  challenge.secret_hidden =
    challenge.id === "mystery" && mysterySecret !== null && !challenge.completed;
  challenge.history =
    challenge.id === "history" && historyState ? clone(historyState) : null;

  neural.clear();
  if (runtimeStatus === "ready") {
    for (const fly of flies) {
      const state = createNeuralState(fly.seed);
      const saved = data.neural?.[fly.id];
      if (saved) {
        state.brain.restore(saved.brain);
        state.previousFired = Int32Array.from(saved.previousFired);
        state.dnTrace = saved.dnTrace;
        state.motorSmooth = { ...saved.motorSmooth };
        state.previousSize = { ...saved.previousSize };
        state.pending = saved.pending.map((item) => ({
          idx: Int32Array.from(item.idx),
          amount: item.amount,
        }));
        state.silenced = new Set(saved.silenced);
        rebuildBlocked(state);
      }
      neural.set(fly.id, state);
    }
  }
}

function randomWorld(seed?: number) {
  const chosen = seed ?? Math.floor(Math.random() * 1_000_000);
  world = {
    seed: chosen,
    daylight: 1,
    wind_x: 0,
    wind_y: 0,
    objects: [],
  };
  const rand = seeded(chosen);

  const specs: Array<[WorldKind, number]> = [
    ["food", 4],
    ["obstacle", 3],
    ["sound", 1],
    ["light", 1],
    ["loom", 1],
  ];

  for (const [kind, count] of specs) {
    for (let i = 0; i < count; i++) {
      addWorldObject({
        kind,
        x: 0.08 + rand() * 0.84,
        y: 0.08 + rand() * 0.84,
        radius: kind === "obstacle" ? 0.055 : 0.03,
        intensity: kind === "obstacle" ? 0 : 0.8,
        amount: kind === "sound" ? 4 : 1,
      });
    }
  }

  addEvent("world", `Randomized world with seed ${chosen}.`);
  return chosen;
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function addWorldObject(body: any) {
  const obj: ArenaObject = {
    id: uid("obj", nextObject++),
    kind: String(body.kind ?? "stimulus") as WorldKind,
    x: clamp(Number(body.x ?? 0.5)),
    y: clamp(Number(body.y ?? 0.5)),
    intensity: Number(body.intensity ?? 0.8),
    radius: Number(body.radius ?? 0.04),
    amount: Number(body.amount ?? 1),
    vx: Number(body.vx ?? 0),
    vy: Number(body.vy ?? 0),
    label: body.label ?? null,
  };
  world.objects.push(obj);
  return clone(obj);
}

function spawnFly(query: URLSearchParams, body?: any) {
  if (flies.length >= MAX_FLIES) {
    throw new Error(`Maximum ${MAX_FLIES} full browser FlyBrain states`);
  }

  const clonePrime = query.get("clone_prime") === "true";
  const bodyType = (query.get("body_type") ??
    body?.body_type ??
    "fly") as BodyType;
  const name =
    query.get("name") ?? body?.name ?? `AGENT ${nextFly}`;
  const id = uid("fly", nextFly++);
  const seed = (world.seed + hashString(id)) >>> 0;

  let fly = makeFly(
    id,
    name,
    false,
    BODIES.includes(bodyType) ? bodyType : "fly",
    seed,
  );

  if (clonePrime) {
    const prime = findFly("prime");
    fly = {
      ...clone(prime),
      id,
      name,
      seed,
      is_prime: false,
      body_type: BODIES.includes(bodyType)
        ? bodyType
        : prime.body_type,
      x: clamp(prime.x + 0.035, 0.04, 0.96),
      y: clamp(prime.y + 0.035, 0.04, 0.96),
      trail: [],
      sampled_fired: [...prime.sampled_fired],
      interventions: clone(prime.interventions),
    };
  }

  flies.push(fly);

  if (runtimeStatus === "ready") {
    if (clonePrime) {
      const source = neural.get("prime");
      const state = createNeuralState(seed);
      if (source) {
        state.brain.copyStateFrom(source.brain);
        state.previousFired = source.previousFired.slice();
        state.dnTrace = source.dnTrace;
        state.motorSmooth = { ...source.motorSmooth };
        state.previousSize = { ...source.previousSize };
        state.pending = source.pending.map((item) => ({
          idx: item.idx.slice(),
          amount: item.amount,
        }));
        state.silenced = new Set(source.silenced);
        rebuildBlocked(state);
      }
      neural.set(id, state);
    } else {
      attachNeural(fly);
    }
  }

  addEvent("agent", `Spawned ${fly.name}; neural state runs locally in this browser.`);
  return publicFly(fly);
}

function forkFly(sourceId: string) {
  if (flies.length >= MAX_FLIES) {
    throw new Error(`Maximum ${MAX_FLIES} full browser FlyBrain states`);
  }

  const source = findFly(sourceId);
  const id = uid("fly", nextFly++);
  const seed = source.seed;
  const copy: LocalFly = {
    ...clone(source),
    id,
    name: `${source.name} FORK`,
    seed,
    is_prime: false,
    x: clamp(source.x + 0.03, 0.04, 0.96),
    y: clamp(source.y + 0.03, 0.04, 0.96),
    trail: [],
  };
  flies.push(copy);

  if (runtimeStatus === "ready") {
    const sourceState = neural.get(sourceId);
    const state = createNeuralState(seed);
    if (sourceState) {
      state.brain.copyStateFrom(sourceState.brain);
      state.previousFired = sourceState.previousFired.slice();
      state.dnTrace = sourceState.dnTrace;
      state.motorSmooth = { ...sourceState.motorSmooth };
      state.previousSize = { ...sourceState.previousSize };
      state.pending = sourceState.pending.map((item) => ({
        idx: item.idx.slice(),
        amount: item.amount,
      }));
      state.silenced = new Set(sourceState.silenced);
      rebuildBlocked(state);
    }
    neural.set(id, state);
  }

  addEvent("agent", `Forked ${source.name} → ${copy.name} with copied neural state.`);
  return publicFly(copy);
}

function applyIntervention(fly: LocalFly, body: any) {
  const kind = String(body?.type ?? "");
  const target = String(body?.target ?? "");
  const state = neural.get(fly.id);

  if (!state || !neuralGroups) {
    throw new Error("Real connectome must finish loading before neural interventions");
  }

  if (challenge.id === "hijack" && kind === "stimulate_population") {
    const budget = challenge.budget ?? 5;
    if (challenge.actions >= budget) {
      throw new Error(`Challenge stimulation budget exhausted (${budget})`);
    }
  }

  const row = {
    type: kind,
    target: target || null,
    amount: Number(body?.amount ?? 0.8),
    fraction: Number(body?.fraction ?? 0.1),
    seed: Number(body?.seed ?? 64),
    time: t,
    active: true,
  };

  if (kind === "stimulate_population") {
    const idx = neuralGroups.populations[target];
    if (!target || !idx?.length) {
      throw new Error(`Unknown or empty population: ${target}`);
    }
    state.pending.push({ idx, amount: row.amount });
    row.active = false;
    challenge.actions += 1;
  } else if (kind === "silence_population") {
    const idx = neuralGroups.populations[target];
    if (!target || !idx?.length) {
      throw new Error(`Unknown or empty population: ${target}`);
    }
    state.silenced.add(target);
    fly.silenced = [...state.silenced];
    rebuildBlocked(state);
  } else if (kind === "restore_population") {
    state.silenced.delete(target);
    fly.silenced = [...state.silenced];
    rebuildBlocked(state);
    row.active = false;
  } else if (kind === "random_synapse_lesion") {
    const changed = state.brain.lesion(row.fraction, row.seed);
    fly.lesionFraction = clamp(
      fly.lesionFraction + changed / Math.max(1, state.brain.weights.nnz),
      0,
      1,
    );
    (row as any).synapses_lesioned = changed;
    (row as any).lesion_fraction = fly.lesionFraction;
    unlockAchievement(
      "chaos_theory",
      "CHAOS THEORY",
      "Applied a seeded random lesion.",
    );
  } else {
    throw new Error(`Unsupported intervention: ${kind}`);
  }

  fly.interventions = [...fly.interventions, row].slice(-32);
  unlockAchievement(
    "brain_surgeon",
    "BRAIN SURGEON",
    "Applied a neural intervention.",
  );
  const lesionDetail =
    kind === "random_synapse_lesion"
      ? ` · ${Number((row as any).synapses_lesioned ?? 0).toLocaleString()} synapses cut · ~${Math.round(fly.lesionFraction * 100)}% cumulative lesion`
      : "";
  addEvent(
    "neural",
    `${fly.name}: ${kind}${target ? ` ${target}` : ""}${lesionDetail}.`,
  );
  return row;
}


function clearWorldObjects() {
  world.objects = [];
}

function resetChallengeFlyState() {
  for (const fly of flies) {
    fly.food_eaten = 0;
    fly.escape_events = 0;
    fly.alive = true;
    fly.energy = Math.max(55, fly.energy);
    fly.hunger = clamp(1 - fly.energy / 100);
    fly.state = "READY";
  }
}

function removeNonPrimeFlies() {
  const removed = new Set(
    flies.filter((fly) => fly.id !== "prime").map((fly) => fly.id),
  );
  flies = flies.filter((fly) => fly.id === "prime");
  for (const id of removed) neural.delete(id);
  couplings = couplings.filter(
    (link) => !removed.has(link.source) && !removed.has(link.target),
  );
}

function startChallenge(id: string) {
  if (!CHALLENGES[id]) throw new Error(`Unknown challenge: ${id}`);

  challenge = challengeState(id);
  mysterySecret = null;
  historyState = null;
  resetChallengeFlyState();

  if (id === "race") {
    clearWorldObjects();
    addWorldObject({ kind: "goal", x: 0.90, y: 0.50, intensity: 1, radius: 0.045, label: "FINISH" });
    addWorldObject({ kind: "obstacle", x: 0.52, y: 0.30, intensity: 0, radius: 0.09 });
    addWorldObject({ kind: "obstacle", x: 0.52, y: 0.70, intensity: 0, radius: 0.09 });
    flies.forEach((fly, index) => {
      fly.x = 0.10;
      fly.y = 0.45 + 0.08 * (index % 2);
      fly.heading = 0;
      fly.trail = [];
    });
  } else if (id === "food_run") {
    clearWorldObjects();
    for (const [x, y] of [[0.2,0.2],[0.8,0.2],[0.2,0.8],[0.8,0.8],[0.5,0.5]] as Array<[number,number]>) {
      addWorldObject({ kind: "food", x, y, intensity: 1, radius: 0.025, amount: 1 });
    }
  } else if (id === "maze") {
    clearWorldObjects();
    addWorldObject({ kind: "food", x: 0.90, y: 0.50, intensity: 1, radius: 0.03, amount: 1 });
    const walls: Array<[number, number, number]> = [
      [0.30,0.25,0.035],[0.30,0.35,0.035],[0.30,0.45,0.035],[0.30,0.55,0.035],
      [0.30,0.65,0.035],[0.52,0.35,0.035],[0.52,0.45,0.035],[0.52,0.55,0.035],
      [0.72,0.25,0.035],[0.72,0.35,0.035],[0.72,0.65,0.035],[0.72,0.75,0.035],
    ];
    for (const [x, y, radius] of walls) {
      addWorldObject({ kind: "obstacle", x, y, intensity: 0, radius });
    }
    flies.forEach((fly, index) => {
      fly.x = 0.08;
      fly.y = 0.44 + index * 0.04;
      fly.heading = 0;
      fly.trail = [];
    });
  } else if (id === "tournament") {
    removeNonPrimeFlies();
    clearWorldObjects();
    const tournamentFood: Array<[number, number]> = [
      [0.18,0.18],[0.50,0.16],[0.82,0.18],
      [0.24,0.34],[0.50,0.34],[0.76,0.34],
      [0.18,0.50],[0.50,0.50],[0.82,0.50],
      [0.24,0.66],[0.50,0.66],[0.76,0.66],
      [0.18,0.82],[0.50,0.84],[0.82,0.82],
    ];
    for (const [x, y] of tournamentFood) {
      addWorldObject({ kind: "food", x, y, intensity: 1, radius: 0.025, amount: 1 });
    }
    const bodies: BodyType[] = ["bot", "car"];
    while (flies.length < Math.min(3, MAX_FLIES)) {
      const index = flies.length;
      const rival = spawnFly(new URLSearchParams(), {
        name: index === 1 ? "LC4-OFF" : "LESION-5%",
        body_type: bodies[Math.min(index - 1, bodies.length - 1)],
      });
      const local = findFly(rival.id);
      local.x = 0.12;
      local.y = 0.35 + index * 0.15;
      local.heading = 0;
      if (index === 1) {
        applyIntervention(local, { type: "silence_population", target: "LC4" });
      } else {
        applyIntervention(local, {
          type: "random_synapse_lesion",
          fraction: 0.05,
          seed: world.seed + 505,
        });
      }
    }
  } else if (id === "survive") {
    world.objects = world.objects.filter((obj) => obj.kind !== "predator");
    addWorldObject({
      kind: "predator", x: 0.85, y: 0.50, intensity: 1, radius: 0.05,
      vx: -0.055, vy: 0.035, label: "PREDATOR",
    });
  } else if (id === "hunt") {
    clearWorldObjects();
    addWorldObject({ kind: "food", x: 0.18, y: 0.18, intensity: 1, radius: 0.025, amount: 1 });
    addWorldObject({ kind: "food", x: 0.82, y: 0.82, intensity: 1, radius: 0.025, amount: 1 });
    addWorldObject({ kind: "predator", x: 0.78, y: 0.50, intensity: 1, radius: 0.055, label: "YOU" });
    for (const fly of flies) {
      fly.x = 0.35;
      fly.y = 0.50;
      fly.trail = [];
    }
  } else if (id === "braincar") {
    clearWorldObjects();
    addWorldObject({ kind: "goal", x: 0.90, y: 0.50, intensity: 1, radius: 0.05, label: "FINISH" });
    addWorldObject({ kind: "obstacle", x: 0.50, y: 0.35, intensity: 0, radius: 0.07 });
    addWorldObject({ kind: "obstacle", x: 0.50, y: 0.65, intensity: 0, radius: 0.07 });
    const prime = findFly("prime");
    prime.body_type = "car";
    prime.x = 0.10;
    prime.y = 0.50;
    prime.heading = 0;
    prime.trail = [];
  } else if (id === "mystery") {
    removeNonPrimeFlies();
    const mysteryPublic = forkFly("prime");
    const candidates = ["LC4", "LPLC2", "LC10a"];
    const target = candidates[Math.abs(world.seed) % candidates.length];
    const mystery = findFly(mysteryPublic.id);
    mystery.name = "MYSTERY";
    const mysteryState = neural.get(mystery.id);
    const mysteryPopulation = neuralGroups?.populations[target];
    if (!mysteryState || !mysteryPopulation?.length) {
      throw new Error("Mystery intervention could not be prepared");
    }
    mysteryState.silenced.add(target);
    mystery.silenced = [...mysteryState.silenced];
    rebuildBlocked(mysteryState);
    mystery.interventions = [
      ...mystery.interventions,
      {
        type: "silence_population",
        target,
        time: t,
        active: true,
        hidden: true,
      },
    ].slice(-32);
    mysterySecret = {
      fly_id: mystery.id,
      type: "silence_population",
      target,
    };
    challenge.secret_hidden = true;
  } else if (id === "history") {
    removeNonPrimeFlies();
    const source = findFly("prime");
    const originalBody = source.body_type;
    const originalController = source.controller;
    const forkPublic = forkFly("prime");
    const fork = findFly(forkPublic.id);
    fork.name = "HISTORY B";

    source.body_type = "synth";
    fork.body_type = "synth";
    source.x = 0.15; source.y = 0.20; source.heading = 0; source.speed = 0; source.trail = [];
    fork.x = 0.15; fork.y = 0.80; fork.heading = 0; fork.speed = 0; fork.trail = [];

    clearWorldObjects();
    addWorldObject({
      kind: "food", x: 0.23, y: 0.20, intensity: 1, radius: 0.026,
      amount: 1, label: "FOOD HISTORY",
    });
    addWorldObject({
      kind: "loom", x: 0.23, y: 0.80, intensity: 1, radius: 0.038,
      label: "THREAT HISTORY",
    });

    const exposureDuration = 3;
    const testDuration = 8;
    historyState = {
      phase: "exposure",
      a: source.id,
      b: fork.id,
      a_history: "food/odor",
      b_history: "loom/threat",
      exposure_started: t,
      exposure_ends: t + exposureDuration,
      exposure_duration: exposureDuration,
      test_duration: testDuration,
      body_type: originalBody,
      controller: originalController,
      samples: 0,
      neural_sum: 0,
      neural_now: 0,
      spatial_now: 0,
      neural_max: 0,
      spatial_max: 0,
      result: null,
      claim: "recent neural history/state dependence; not learned biological memory",
    };
    challenge.history = clone(historyState);
    addEvent(
      "challenge",
      "RECENT HISTORY: exact browser fork created; A gets food/odor history, B gets loom/threat history.",
    );
  }

  addEvent("challenge", `Started ${challenge.name}.`);
  return clone(challenge);
}

function advanceHistoryExperiment() {
  const exp = historyState;
  if (challenge.id !== "history" || !exp || challenge.completed) return;

  if (exp.phase === "exposure" && t >= exp.exposure_ends) {
    clearWorldObjects();
    for (const id of [exp.a, exp.b]) {
      const fly = flies.find((item) => item.id === id);
      if (!fly) continue;
      fly.x = 0.24;
      fly.y = 0.50;
      fly.heading = 0;
      fly.speed = 0;
      fly.state = "HISTORY TEST";
      fly.body_type = exp.body_type;
      fly.controller = exp.controller;
      fly.trail = [];
    }

    exp.phase = "test";
    exp.test_started = t;
    exp.test_ends = t + exp.test_duration;
    challenge.history = clone(exp);
    addEvent(
      "challenge",
      "RECENT HISTORY: exposure cues removed; identical neutral test started.",
    );
    return;
  }

  if (exp.phase !== "test") return;

  const aFly = flies.find((fly) => fly.id === exp.a);
  const bFly = flies.find((fly) => fly.id === exp.b);
  const aNeural = neural.get(exp.a)?.previousFired;
  const bNeural = neural.get(exp.b)?.previousFired;
  if (!aFly || !bFly || !aNeural || !bNeural) return;

  const intersection = countIntersection(aNeural, bNeural);
  const union = aNeural.length + bNeural.length - intersection;
  const neuralDelta = union ? 1 - intersection / union : 0;
  const spatialDelta = Math.hypot(aFly.x - bFly.x, aFly.y - bFly.y);

  exp.samples += 1;
  exp.neural_sum += neuralDelta;
  exp.neural_now = neuralDelta;
  exp.spatial_now = spatialDelta;
  exp.neural_max = Math.max(exp.neural_max, neuralDelta);
  exp.spatial_max = Math.max(exp.spatial_max, spatialDelta);

  if (exp.test_ends != null && t >= exp.test_ends) {
    const samples = Math.max(1, exp.samples);
    exp.phase = "complete";
    exp.result = {
      mean_neural_divergence: exp.neural_sum / samples,
      max_neural_divergence: exp.neural_max,
      max_behavioral_divergence: exp.spatial_max,
      samples,
      interpretation:
        "Different recent sensory histories produced different continuing neural states during the same neutral test. This is short-term state/history dependence, not a claim of learned biological memory.",
    };
    challenge.completed = true;
    addEvent("challenge", "RECENT HISTORY challenge complete.");
  }

  challenge.history = clone(exp);
}

async function runBatchProbe(body: any) {
  if (!connectomeMeta || !connectomeWeights || !neuralGroups) {
    throw new Error("Real connectome is not ready");
  }

  const population = String(body?.population ?? "LC4");
  const idx = neuralGroups.populations[population];
  if (!idx?.length) {
    throw new Error(`Unknown or empty population: ${population}`);
  }

  const amount = Number(body?.amount ?? 0.8);
  const steps = Math.max(1, Math.min(200, Number(body?.steps ?? 50)));
  const replicates = Math.max(
    1,
    Math.min(8, Number(body?.replicates ?? 4)),
  );
  const seed = Number(body?.seed ?? world.seed);
  const traceDecay = Math.exp(-connectomeMeta.params.dt / 0.1);
  const rows: any[] = [];

  for (let replicate = 0; replicate < replicates; replicate++) {
    const brain = new ConnectomeBrain(
      connectomeWeights,
      connectomeMeta.params,
      seed + replicate,
    );
    let totalSpikes = 0;
    let trace = 0;
    let traceSum = 0;
    let tracePeak = 0;

    for (let step = 0; step < steps; step++) {
      brain.stimulate(idx, amount);
      const fired = Int32Array.from(brain.step());
      totalSpikes += fired.length;
      const dnCount = countIntersection(fired, neuralGroups.dn);
      trace =
        trace * traceDecay +
        dnCount / Math.max(1, neuralGroups.dn.length);
      traceSum += trace;
      tracePeak = Math.max(tracePeak, trace);

      if (step % 10 === 9) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    const duration = steps * connectomeMeta.params.dt;
    rows.push({
      replicate,
      mean_firing_per_step: totalSpikes / steps,
      mean_firing_hz_total: totalSpikes / duration,
      mean_dn_trace: traceSum / steps,
      peak_dn_trace: tracePeak,
    });
  }

  const meanTrace =
    rows.reduce((sum, row) => sum + row.mean_dn_trace, 0) /
    rows.length;
  const variance =
    rows.reduce(
      (sum, row) =>
        sum + (row.mean_dn_trace - meanTrace) ** 2,
      0,
    ) / rows.length;

  return {
    population,
    population_neurons: idx.length,
    amount,
    steps,
    dt: connectomeMeta.params.dt,
    duration: steps * connectomeMeta.params.dt,
    replicates,
    seed,
    rows,
    summary: {
      mean_firing_per_step:
        rows.reduce(
          (sum, row) => sum + row.mean_firing_per_step,
          0,
        ) / rows.length,
      mean_dn_trace: meanTrace,
      sd_dn_trace: Math.sqrt(variance),
    },
    provenance:
      "Real MaleCNS/FlyBrain browser simulation; web-export synaptic weights use FlyBrain's log-quantized encoding.",
  };
}

function runConsole(command: string) {
  const parts = command.trim().split(/\s+/);
  if (!parts[0]) return { ok: true };

  const verb = parts[0].toLowerCase();
  if (verb === "pause") running = false;
  else if (verb === "resume" || verb === "play") {
    resumeWhenReady = true;
    running = runtimeStatus === "ready";
  } else if (verb === "fork") {
    return forkFly("prime");
  } else if (verb === "random") {
    return randomWorld(Number(parts[1] ?? world.seed));
  } else if (verb === "challenge") {
    return startChallenge(parts[1] ?? "sandbox");
  } else if (verb === "spawn") {
    return addWorldObject({
      kind: parts[1] ?? "food",
      x: Number(parts[2] ?? 0.5),
      y: Number(parts[3] ?? 0.5),
    });
  } else if (
    verb === "stim" ||
    verb === "silence" ||
    verb === "restore"
  ) {
    return applyIntervention(findFly("prime"), {
      type:
        verb === "stim"
          ? "stimulate_population"
          : verb === "silence"
            ? "silence_population"
            : "restore_population",
      target: parts[1] ?? "LC4",
      amount: Number(parts[2] ?? 0.8),
    });
  } else {
    throw new Error(`Unsupported browser console command: ${verb}`);
  }

  return { ok: true };
}

function resetSandbox() {
  const controller =
    flies.find((fly) => fly.id === "prime")?.controller ?? "play";
  running = false;
  resumeWhenReady = false;
  t = 0;
  speedAccumulator = 0;
  world = makeWorld(world.seed);
  flies = [makeFly("prime", "PRIME", true, "fly", world.seed)];
  flies[0].controller = controller;
  events = [
    {
      t: 0,
      kind: "system",
      message:
        runtimeStatus === "ready"
          ? "Browser FlyBrain sandbox reset."
          : "Sandbox reset while connectome is loading.",
    },
  ];
  couplings = [];
  achievements = [];
  checkpoints = [];
  challenge = challengeState("sandbox");
  mysterySecret = null;
  historyState = null;
  neural.clear();
  if (runtimeStatus === "ready") attachNeural(flies[0]);
}

async function rpc(
  method: RpcRequest["method"],
  rawPath: string,
  body?: any,
) {
  const { path, query } = parsePath(rawPath);

  if (method === "GET") {
    if (path === "/api/state") return framePayload();
    if (path === "/api/metadata") return metadata();
    if (path === "/api/experiments/export") {
      return {
        runtime: "browser-flybrain",
        exported_at: new Date().toISOString(),
        state: jsonSafe(snapshot()),
      };
    }

    let match = path.match(/^\/api\/populations\/([^/]+)$/);
    if (match) {
      return { populations: populationStatus(findFly(match[1])) };
    }

    match = path.match(/^\/api\/brain\/([^/]+)\/sample$/);
    if (match) {
      findFly(match[1]);
      return {
        kind: somaStore ? "anatomical" : "real-connectome-no-soma-web-export",
        projection: somaStore
          ? "MaleCNS soma positions in normalized EM x/y/z coordinates"
          : null,
        mapped: somaStore?.mapped ?? 0,
        neurons: connectomeMeta?.n ?? EXPECTED_NEURONS,
        points: somaStore?.sample ?? [],
      };
    }
  }

  if (method === "POST") {
    if (path === "/api/simulation/resume") {
      resumeWhenReady = true;
      running = runtimeStatus === "ready";
      return {
        running,
        waiting_for_connectome: runtimeStatus !== "ready",
      };
    }

    if (path === "/api/simulation/pause") {
      resumeWhenReady = false;
      running = false;
      return { running };
    }

    if (path === "/api/simulation/step") {
      if (runtimeStatus !== "ready") {
        throw new Error("Connectome is still loading");
      }
      advance();
      emitFrame();
      return framePayload();
    }

    if (path === "/api/simulation/reset") {
      resetSandbox();
      emitFrame();
      return framePayload();
    }

    let match = path.match(/^\/api\/simulation\/speed\/([0-9.]+)$/);
    if (match) {
      const next = Number(match[1]);
      if (![0.05, 0.25, 1, 2, 5, 10].includes(next)) {
        throw new Error(
          "Speed must be 0.05, 0.25, 1, 2, 5, or 10",
        );
      }
      speed = next;
      speedAccumulator = 0;
      return { speed };
    }

    if (path === "/api/flies") return spawnFly(query, body);

    match = path.match(/^\/api\/flies\/([^/]+)\/fork$/);
    if (match) return forkFly(match[1]);

    match = path.match(/^\/api\/flies\/([^/]+)\/rename$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.name = String(body?.name ?? fly.name).slice(0, 40);
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/body\/([^/]+)$/);
    if (match) {
      const fly = findFly(match[1]);
      const bodyType = match[2] as BodyType;
      if (!BODIES.includes(bodyType)) {
        throw new Error(`Unknown body: ${bodyType}`);
      }
      fly.body_type = bodyType;
      return { ok: true, body_type: bodyType };
    }

    match = path.match(
      /^\/api\/flies\/([^/]+)\/controller\/([^/]+)$/,
    );
    if (match) {
      const fly = findFly(match[1]);
      const controller = match[2] as Controller;
      if (!["play", "lab"].includes(controller)) {
        throw new Error("Unknown controller");
      }
      fly.controller = controller;
      return { ok: true, controller };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/move$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.x = clamp(
        Number(query.get("x") ?? fly.x),
        0.02,
        0.98,
      );
      fly.y = clamp(
        Number(query.get("y") ?? fly.y),
        0.02,
        0.98,
      );
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/drive$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.manualTurn = clamp(Number(body?.turn ?? 0), -1, 1);
      fly.manualThrottle = clamp(
        Number(body?.throttle ?? 0),
        -1,
        1,
      );
      fly.manualUntil = t + 0.2;
      return { ok: true };
    }

    match = path.match(
      /^\/api\/flies\/([^/]+)\/interventions$/,
    );
    if (match) return applyIntervention(findFly(match[1]), body);

    match = path.match(
      /^\/api\/flies\/([^/]+)\/sensory-gain\/([0-9.]+)$/,
    );
    if (match) {
      const fly = findFly(match[1]);
      fly.sensoryGain = clamp(Number(match[2]), 0, 2);
      return { gain: fly.sensoryGain };
    }

    if (path === "/api/world/environment") {
      world.daylight = clamp(
        Number(body?.daylight ?? world.daylight),
        0,
        1,
      );
      world.wind_x = Number(body?.wind_x ?? world.wind_x);
      world.wind_y = Number(body?.wind_y ?? world.wind_y);
      return framePayload();
    }

    if (path === "/api/world") return addWorldObject(body ?? {});

    match = path.match(/^\/api\/world\/([^/]+)\/move$/);
    if (match) {
      const obj = world.objects.find(
        (item) => item.id === match![1],
      );
      if (!obj) {
        throw new Error(`Unknown world object: ${match[1]}`);
      }
      obj.x = clamp(Number(query.get("x") ?? obj.x));
      obj.y = clamp(Number(query.get("y") ?? obj.y));
      return { ok: true };
    }

    if (path === "/api/world/randomize") {
      const seed = query.get("seed");
      randomWorld(seed === null ? undefined : Number(seed));
      return framePayload();
    }

    if (path === "/api/world/daily") {
      const date = new Date();
      const dailySeed =
        date.getUTCFullYear() * 10000 +
        (date.getUTCMonth() + 1) * 100 +
        date.getUTCDate();
      randomWorld(dailySeed);
      return { seed: dailySeed, frame: framePayload() };
    }

    if (path === "/api/couplings") {
      if (!neuralGroups) throw new Error("Connectome is still loading");

      const population = String(body?.population ?? "LC10a");
      if (!neuralGroups.populations[population]?.length) {
        throw new Error(
          `Unknown or empty coupling population: ${population}`,
        );
      }

      const source = String(body?.source ?? "prime");
      const target = String(body?.target ?? "");
      if (source === target) {
        throw new Error("source and target must be different agents");
      }
      findFly(source);
      findFly(target);

      const coupling = {
        source,
        target,
        population,
        gain: Number(body?.gain ?? 0.5),
        kind: "experimental_artificial_coupling",
      };
      couplings = couplings.filter(
        (item) =>
          !(
            item.source === coupling.source &&
            item.target === coupling.target
          ),
      );
      couplings.push(coupling);
      return clone(coupling);
    }

    if (path === "/api/challenges/mystery/reveal") {
      if (challenge.id !== "mystery") {
        throw new Error("Mystery challenge is not active");
      }
      challenge.completed = true;
      challenge.secret_hidden = false;
      const secret = clone(mysterySecret);
      if (secret) {
        addEvent(
          "challenge",
          `MYSTERY REVEALED: ${secret.target} silenced on ${secret.fly_id}.`,
        );
      }
      return { secret };
    }

    match = path.match(/^\/api\/challenges\/([^/]+)$/);
    if (match) {
      return startChallenge(match[1]);
    }

    if (path === "/api/console") {
      return runConsole(String(body?.command ?? ""));
    }

    if (path === "/api/time/checkpoint") {
      const checkpoint: Checkpoint = {
        id: uid("cp", nextCheckpoint++),
        label: String(body?.label ?? `T+${t.toFixed(2)}`),
        t,
        snapshot: snapshot(),
      };
      checkpoints.push(checkpoint);
      if (checkpoints.length > 8) checkpoints = checkpoints.slice(-8);
      return {
        id: checkpoint.id,
        label: checkpoint.label,
        t: checkpoint.t,
      };
    }

    if (path === "/api/time/rewind") {
      const requested =
        query.get("checkpoint_id") ?? body?.checkpoint_id;
      const checkpoint = requested
        ? checkpoints.find((item) => item.id === requested)
        : checkpoints.at(-1);
      if (!checkpoint) throw new Error("No checkpoint available");

      restore(checkpoint.snapshot);
      addEvent("time", `Rewound to ${checkpoint.label}.`);
      emitFrame();
      return framePayload();
    }

    if (path === "/api/experiments/import") {
      const imported = body?.state ?? body;
      if (!imported?.world || !Array.isArray(imported?.flies)) {
        throw new Error("Invalid browser experiment export");
      }
      restore(imported as Snapshot);
      emitFrame();
      return framePayload();
    }

    if (path === "/api/batch/probe") {
      return runBatchProbe(body);
    }
  }

  if (method === "DELETE") {
    if (path === "/api/world") {
      world.objects = [];
      return { ok: true };
    }

    if (path === "/api/couplings") {
      couplings = [];
      return { ok: true };
    }

    let match = path.match(/^\/api\/world\/([^/]+)$/);
    if (match) {
      world.objects = world.objects.filter(
        (obj) => obj.id !== match![1],
      );
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)$/);
    if (match) {
      if (match[1] === "prime") {
        throw new Error("PRIME cannot be removed");
      }
      flies = flies.filter((fly) => fly.id !== match![1]);
      neural.delete(match[1]);
      couplings = couplings.filter(
        (link) =>
          link.source !== match![1] && link.target !== match![1],
      );
      return { ok: true };
    }
  }

  throw new Error(
    `Unsupported browser API route: ${method} ${rawPath}`,
  );
}

scope.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.type === "subscribe") {
    frameSubscribers += 1;
    scope.postMessage(framePayload());
    return;
  }

  if (message.type === "unsubscribe") {
    frameSubscribers = Math.max(0, frameSubscribers - 1);
    return;
  }

  if (message.type === "close") {
    running = false;
    scope.close?.();
    return;
  }

  if (message.type === "rpc") {
    try {
      const data = await rpc(
        message.method,
        message.path,
        message.body,
      );
      scope.postMessage({
        type: "rpc_result",
        id: message.id,
        ok: true,
        data,
      });
      emitFrame();
    } catch (error) {
      scope.postMessage({
        type: "rpc_result",
        id: message.id,
        ok: false,
        error:
          error instanceof Error ? error.message : String(error),
      });
    }
  }
};

setInterval(() => {
  if (running && runtimeStatus === "ready") {
    speedAccumulator += speed;
    const steps = Math.min(10, Math.floor(speedAccumulator));
    if (steps > 0) {
      speedAccumulator -= steps;
      for (let i = 0; i < steps; i++) advance();
    }
  }

  emitFrame();
}, 20);

void bootConnectome();
