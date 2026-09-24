import type {
  ArenaObject,
  ChallengeState,
  FlyFrame,
  Frame,
  Metadata,
  WorldKind,
} from "./types";

type BodyType = FlyFrame["body_type"];
type Controller = FlyFrame["controller"];

type LocalFly = FlyFrame & {
  sensoryGain: number;
  manualTurn: number;
  manualThrottle: number;
  manualUntil: number;
  silenced: string[];
  lesionFraction: number;
};

type Checkpoint = {
  id: string;
  label: string;
  t: number;
  snapshot: Snapshot;
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
  | { type: "close" };

const scope = globalThis as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<InboundMessage>) => void) | null;
  close?: () => void;
};

const POPULATIONS: Record<string, number> = {
  LC4: 126,
  LPLC2: 185,
  LPLC1: 170,
  LC10a: 275,
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

const DT = 0.02;
const NEURONS = 166_700;
const SYNAPSES = 25_582_938;
const MAX_FLIES = 8;

let nextObject = 1;
let nextFly = 1;
let nextCheckpoint = 1;
let frameSubscribers = 0;
let checkpoints: Checkpoint[] = [];

let t = 0;
let running = false;
let speed = 1;
let world: Frame["world"] = makeWorld(64);
let flies: LocalFly[] = [makeFly("prime", "PRIME", true, "fly")];
let events: Frame["events"] = [
  { t: 0, kind: "system", message: "Browser simulation worker ready." },
];
let couplings: Frame["couplings"] = [];
let achievements: Frame["achievements"] = [];
let challenge: ChallengeState = challengeState("sandbox");
let mysteryRevealed = false;

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

function uid(prefix: string, counter: number) {
  return `${prefix}-${counter.toString(36)}`;
}

function makeWorld(seed: number): Frame["world"] {
  return {
    seed,
    daylight: 1,
    wind_x: 0,
    wind_y: 0,
    objects: [],
  };
}

function makeFly(
  id: string,
  name: string,
  isPrime: boolean,
  bodyType: BodyType,
): LocalFly {
  const offset = isPrime ? 0 : ((nextFly % 5) - 2) * 0.025;
  return {
    id,
    name,
    is_prime: isPrime,
    body_type: bodyType,
    controller: "play",
    state: "EXPLORING",
    alive: true,
    x: clamp(0.5 + offset, 0.08, 0.92),
    y: clamp(0.5 - offset, 0.08, 0.92),
    heading: -Math.PI / 2,
    speed: 0.04,
    energy: 100,
    hunger: 0,
    food_eaten: 0,
    escape_events: 0,
    fired_count: 0,
    firing_fraction: 0,
    newly_firing: 0,
    firing_jaccard_distance: 0,
    dn_activity: 0,
    dn_fired: 0,
    motor: {
      forward: 0,
      steer_L: 0,
      steer_R: 0,
      escape: 0,
      backward: 0,
    },
    senses: {
      food_odor: 0,
      target: 0,
      obstacle: 0,
      loom: 0,
      threat: 0,
      sound: 0,
      touch: 0,
      light: 0,
    },
    assists: {
      forage: 0,
      target: 0,
      orient: 0,
      avoid: 0,
      obstacle: 0,
      edge: 0,
      search: 0,
    },
    trail: [],
    sampled_fired: [],
    brain_view: {
      kind: "client-worker-placeholder",
      mapped: 0,
      firing_positions: [],
    },
    interventions: [],
    sensoryGain: 1,
    manualTurn: 0,
    manualThrottle: 0,
    manualUntil: 0,
    silenced: [],
    lesionFraction: 0,
  };
}

function publicFly(fly: LocalFly): FlyFrame {
  const {
    sensoryGain: _sensoryGain,
    manualTurn: _manualTurn,
    manualThrottle: _manualThrottle,
    manualUntil: _manualUntil,
    silenced: _silenced,
    lesionFraction: _lesionFraction,
    ...publicState
  } = fly;
  return clone(publicState);
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
    secret_hidden: id === "mystery" && !mysteryRevealed,
    history: null,
  };
}

function metadata(): Metadata {
  return {
    neurons: NEURONS,
    synapses: SYNAPSES,
    dt: DT,
    max_flies: MAX_FLIES,
    mock: true,
    bodies: BODIES,
    challenges: CHALLENGES,
    provenance: {
      graph: {
        label: "CLIENT RUNTIME FOUNDATION",
        description:
          "The sandbox now runs inside a browser Web Worker. The real FlyBrain graph loader is the next migration stage.",
      },
      behavior: {
        label: "TEMPORARY COMPATIBILITY MODEL",
        description:
          "This branch keeps the UI interactive while the 25.6M-edge FlyBrain stepper is moved from Python to browser compute.",
      },
    },
    sensory_provenance: {},
    motor_provenance: {},
    motor_mapping:
      "Compatibility mapping only on this migration branch; real DN readout port is pending.",
  };
}

function addEvent(kind: string, message: string) {
  events.push({ t, kind, message });
  if (events.length > 160) events = events.slice(-160);
}

function objectDistance(fly: LocalFly, obj: ArenaObject) {
  return Math.hypot(fly.x - obj.x, fly.y - obj.y);
}

function nearest(
  fly: LocalFly,
  kinds: WorldKind[],
): { obj: ArenaObject; distance: number } | null {
  let winner: { obj: ArenaObject; distance: number } | null = null;
  for (const obj of world.objects) {
    if (!kinds.includes(obj.kind)) continue;
    const distance = objectDistance(fly, obj);
    if (!winner || distance < winner.distance) winner = { obj, distance };
  }
  return winner;
}

function attraction(fly: LocalFly, obj: ArenaObject, scale: number) {
  const desired = Math.atan2(obj.y - fly.y, obj.x - fly.x);
  return clamp(wrapAngle(desired - fly.heading) * scale, -2.5, 2.5);
}

function avoidance(fly: LocalFly, obj: ArenaObject, scale: number) {
  const desired = Math.atan2(fly.y - obj.y, fly.x - obj.x);
  return clamp(wrapAngle(desired - fly.heading) * scale, -3, 3);
}

function advance(stepDt: number) {
  t += stepDt;
  challenge.elapsed = Math.max(0, t - challenge.started);

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

  for (const fly of flies) stepFly(fly, stepDt);
  evaluateChallenge();
  updateComparisons();
}

function stepFly(fly: LocalFly, stepDt: number) {
  if (!fly.alive) return;

  const food = nearest(fly, ["food", "odor"]);
  const threat = nearest(fly, ["predator", "loom"]);
  const obstacle = nearest(fly, ["obstacle"]);
  const target = nearest(fly, ["stimulus", "goal"]);
  const sound = nearest(fly, ["sound"]);
  const light = nearest(fly, ["light"]);

  const foodSense = food
    ? clamp((food.obj.intensity * Math.max(0.1, food.obj.amount)) / (0.16 + food.distance * food.distance * 8))
    : 0;
  const threatSense = threat
    ? clamp(threat.obj.intensity / (0.2 + threat.distance * 3))
    : 0;
  const obstacleSense = obstacle
    ? clamp(1 - Math.max(0, obstacle.distance - obstacle.obj.radius) / 0.22)
    : 0;
  const targetSense = target
    ? clamp(target.obj.intensity / (0.35 + target.distance * 2.2))
    : 0;
  const soundSense = sound
    ? clamp(sound.obj.intensity / (0.3 + sound.distance * 2.8))
    : 0;
  const lightSense = light
    ? clamp((light.obj.intensity * world.daylight) / (0.4 + light.distance * 2))
    : 0;

  const touch =
    obstacle && obstacle.distance < obstacle.obj.radius + 0.024 ? 1 : 0;

  fly.senses = {
    food_odor: foodSense * fly.sensoryGain,
    target: targetSense * fly.sensoryGain,
    obstacle: obstacleSense * fly.sensoryGain,
    loom: threat?.obj.kind === "loom" ? threatSense * fly.sensoryGain : 0,
    threat: threatSense * fly.sensoryGain,
    sound: soundSense * fly.sensoryGain,
    touch,
    light: lightSense * fly.sensoryGain,
  };

  const edgeX = Math.min(fly.x, 1 - fly.x);
  const edgeY = Math.min(fly.y, 1 - fly.y);
  const edgeSense = clamp((0.12 - Math.min(edgeX, edgeY)) / 0.12);

  let forage = 0;
  let targetAssist = 0;
  let orient = 0;
  let avoid = 0;
  let obstacleAssist = 0;
  let edge = 0;
  let search = 0;

  if (fly.controller === "play") {
    if (food?.obj.kind === "food" && foodSense > 0.02) {
      forage = attraction(fly, food.obj, 0.9) * foodSense;
    }
    if (target && targetSense > 0.03) {
      targetAssist = attraction(fly, target.obj, 0.7) * targetSense;
    }
    if (sound && soundSense > 0.03) {
      orient += attraction(fly, sound.obj, 0.35) * soundSense;
    }
    if (light && lightSense > 0.03) {
      orient += attraction(fly, light.obj, 0.25) * lightSense;
    }
    if (threat && threatSense > 0.04) {
      avoid = avoidance(fly, threat.obj, 1.5) * threatSense;
    }
    if (obstacle && obstacleSense > 0.04) {
      obstacleAssist = avoidance(fly, obstacle.obj, 1.8) * obstacleSense;
    }
    if (edgeSense > 0) {
      const center = { ...world.objects[0], x: 0.5, y: 0.5 } as ArenaObject;
      edge = attraction(fly, center, 1.6) * edgeSense;
    }
    search = Math.sin(t * 1.7 + fly.id.length) * 0.18;
  }

  fly.assists = {
    forage,
    target: targetAssist,
    orient,
    avoid,
    obstacle: obstacleAssist,
    edge,
    search,
  };

  let turn = forage + targetAssist + orient + avoid + obstacleAssist + edge + search;
  let throttle = 0.65 + foodSense * 0.15 + targetSense * 0.1;

  if (t < fly.manualUntil) {
    turn += fly.manualTurn * 1.9;
    throttle += fly.manualThrottle * 0.75;
    fly.state = "POSSESSED";
  } else if (threatSense > 0.36) {
    fly.state = "ESCAPING";
  } else {
    fly.state = "EXPLORING";
  }

  const escape = threatSense * 20;
  const steerMagnitude = Math.min(20, Math.abs(turn) * 8);
  fly.motor = {
    forward: Math.max(0, throttle * 10),
    steer_L: turn < 0 ? steerMagnitude : 0,
    steer_R: turn > 0 ? steerMagnitude : 0,
    escape,
    backward: fly.manualThrottle < -0.2 && t < fly.manualUntil
      ? Math.abs(fly.manualThrottle) * 10
      : 0,
  };

  fly.heading = wrapAngle(fly.heading + turn * stepDt * 2.8);
  fly.speed = clamp(0.03 + Math.max(0, throttle) * 0.075 + threatSense * 0.04, 0, 0.18);

  const oldX = fly.x;
  const oldY = fly.y;
  fly.x += Math.cos(fly.heading) * fly.speed * stepDt;
  fly.y += Math.sin(fly.heading) * fly.speed * stepDt;

  if (fly.x < 0.02 || fly.x > 0.98) {
    fly.x = clamp(fly.x, 0.022, 0.978);
    fly.heading = Math.PI - fly.heading;
  }
  if (fly.y < 0.02 || fly.y > 0.98) {
    fly.y = clamp(fly.y, 0.022, 0.978);
    fly.heading = -fly.heading;
  }
  fly.heading = wrapAngle(fly.heading);

  if (obstacle && objectDistance(fly, obstacle.obj) < obstacle.obj.radius + 0.018) {
    fly.x = oldX;
    fly.y = oldY;
    fly.heading = wrapAngle(fly.heading + (turn >= 0 ? -1 : 1) * 0.9);
    fly.senses.touch = 1;
  }

  const edible = world.objects.find(
    (obj) =>
      obj.kind === "food" &&
      Math.hypot(fly.x - obj.x, fly.y - obj.y) < obj.radius + 0.028,
  );
  if (edible) {
    const bite = Math.min(edible.amount, 0.004);
    edible.amount -= bite;
    fly.energy = clamp(fly.energy + bite * 140, 0, 100);
    fly.food_eaten += bite;
    fly.state = "FEEDING";
    if (edible.amount <= 0.00001) {
      world.objects = world.objects.filter((obj) => obj.id !== edible.id);
      addEvent("food", `${fly.name} finished a fruit.`);
      unlockAchievement("first_bite", "FIRST BITE", "A fly ate food.");
    }
  }

  const predator = world.objects.find(
    (obj) =>
      obj.kind === "predator" &&
      Math.hypot(fly.x - obj.x, fly.y - obj.y) < obj.radius + 0.02,
  );
  if (predator) {
    fly.alive = false;
    fly.state = "CAUGHT";
    addEvent("danger", `${fly.name} was caught by the predator.`);
  }

  fly.energy = clamp(fly.energy - stepDt * (0.12 + fly.speed * 0.5), 0, 100);
  fly.hunger = clamp(100 - fly.energy, 0, 100);
  if (fly.energy <= 0) {
    fly.alive = false;
    fly.state = "EXHAUSTED";
  }

  if (threatSense > 0.58) fly.escape_events += 1;

  const activity =
    foodSense + threatSense + obstacleSense + targetSense + soundSense + lightSense;
  const lesionPenalty = 1 - clamp(fly.lesionFraction, 0, 0.9);
  fly.fired_count = Math.round((7800 + activity * 2800) * lesionPenalty);
  fly.firing_fraction = fly.fired_count / NEURONS;
  fly.newly_firing = Math.round(400 + activity * 900);
  fly.firing_jaccard_distance = clamp(activity * 0.08 + fly.lesionFraction * 0.35);
  fly.dn_activity = clamp(
    (fly.motor.forward + fly.motor.steer_L + fly.motor.steer_R + escape) / 130,
    0,
    1,
  );
  fly.dn_fired = Math.round(fly.dn_activity * POPULATIONS.descending_neuron);
  fly.sampled_fired = sampleNeuronIds(fly, activity);

  if (t - (fly.trail.at(-1)?.t ?? -Infinity) >= 0.08) {
    fly.trail.push({ t, x: fly.x, y: fly.y });
    if (fly.trail.length > 240) fly.trail = fly.trail.slice(-240);
  }
}

function sampleNeuronIds(fly: LocalFly, activity: number) {
  const count = Math.max(12, Math.min(96, Math.round(24 + activity * 30)));
  const base = Math.abs(hashString(fly.id)) + Math.floor(t * 50);
  return Array.from({ length: count }, (_, i) => (base * 7919 + i * 104729) % NEURONS);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return hash;
}

function unlockAchievement(key: string, title: string, description: string) {
  if (achievements.some((item) => item.key === key)) return;
  achievements.push({ key, title, description });
}

function comparisons() {
  const rows: Frame["comparisons"] = [];
  for (let i = 0; i < flies.length; i++) {
    for (let j = i + 1; j < flies.length; j++) {
      const a = flies[i];
      const b = flies[j];
      rows.push({
        a: a.id,
        b: b.id,
        a_name: a.name,
        b_name: b.name,
        neural_divergence: clamp(
          Math.abs(a.dn_activity - b.dn_activity) +
            Math.abs(a.firing_fraction - b.firing_fraction) * 8,
        ),
        behavioral_divergence: clamp(Math.hypot(a.x - b.x, a.y - b.y)),
        energy_delta: Math.abs(a.energy - b.energy),
      });
    }
  }
  return rows;
}

function updateComparisons() {
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
}

function evaluateChallenge() {
  if (challenge.completed) return;

  if (challenge.goal === "food" && flies.some((fly) => fly.food_eaten >= 3)) {
    completeChallenge(flies.find((fly) => fly.food_eaten >= 3)?.name ?? null);
  } else if (
    challenge.goal === "survive" &&
    challenge.target &&
    challenge.elapsed >= challenge.target &&
    flies.some((fly) => fly.alive)
  ) {
    completeChallenge(flies.find((fly) => fly.alive)?.name ?? null);
  } else if (challenge.goal === "race") {
    for (const fly of flies) {
      const goal = nearest(fly, ["goal", "stimulus"]);
      if (goal && goal.distance < goal.obj.radius + 0.025) {
        completeChallenge(fly.name);
        break;
      }
    }
  } else if (
    challenge.goal === "dn_activity" &&
    flies.some((fly) => fly.dn_activity >= (challenge.target ?? 0.12))
  ) {
    completeChallenge(
      flies.find((fly) => fly.dn_activity >= (challenge.target ?? 0.12))?.name ?? null,
    );
  }
}

function completeChallenge(winner: string | null) {
  challenge.completed = true;
  challenge.winner = winner;
  addEvent(
    "challenge",
    winner ? `${winner} completed ${challenge.name}.` : `${challenge.name} completed.`,
  );
}

function framePayload(): Frame {
  return {
    type: "frame",
    t,
    running,
    speed,
    mock: true,
    flies: flies.map(publicFly),
    world: clone(world),
    events: clone(events),
    challenge: clone(challenge),
    achievements: clone(achievements),
    couplings: clone(couplings),
    comparisons: comparisons(),
    checkpoints: checkpoints.map(({ id, label, t: checkpointT }) => ({
      id,
      label,
      t: checkpointT,
    })),
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
  const values: Record<string, number> = {
    LC4: fly.senses.threat ?? 0,
    LPLC2: fly.senses.loom ?? 0,
    LPLC1: fly.senses.target ?? 0,
    LC10a: fly.senses.target ?? 0,
    ORN_DM1: fly.senses.food_odor ?? 0,
    ORN_DM2: fly.senses.food_odor ?? 0,
    SNta: fly.senses.touch ?? 0,
    DNg100: (fly.motor.forward ?? 0) / 20,
    DNa02: ((fly.motor.steer_L ?? 0) + (fly.motor.steer_R ?? 0)) / 40,
    DNp01: (fly.motor.escape ?? 0) / 20,
    MDN: (fly.motor.backward ?? 0) / 20,
    descending_neuron: fly.dn_activity,
  };

  return Object.entries(POPULATIONS).map(([name, neurons]) => ({
    name,
    neurons,
    firing: Math.min(
      neurons,
      Math.round((values[name] ?? fly.firing_fraction) * neurons),
    ),
    silenced: fly.silenced.includes(name),
  }));
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
  };
}

function restore(data: Snapshot) {
  t = data.t;
  running = data.running;
  speed = data.speed;
  world = clone(data.world);
  flies = clone(data.flies);
  events = clone(data.events);
  couplings = clone(data.couplings);
  achievements = clone(data.achievements);
  challenge = clone(data.challenge);
}

function randomWorld(seed?: number) {
  const chosen = seed ?? Math.floor(Math.random() * 1_000_000);
  world = makeWorld(chosen);
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
  if (flies.length >= MAX_FLIES) throw new Error(`Maximum ${MAX_FLIES} agents`);

  const clonePrime = query.get("clone_prime") === "true";
  const bodyType = (query.get("body_type") ?? body?.body_type ?? "fly") as BodyType;
  const name = query.get("name") ?? body?.name ?? `AGENT ${nextFly}`;
  const id = uid("fly", nextFly++);

  let fly = makeFly(id, name, false, BODIES.includes(bodyType) ? bodyType : "fly");
  if (clonePrime) {
    const prime = findFly("prime");
    fly = {
      ...clone(prime),
      id,
      name,
      is_prime: false,
      body_type: BODIES.includes(bodyType) ? bodyType : prime.body_type,
      x: clamp(prime.x + 0.035, 0.04, 0.96),
      y: clamp(prime.y + 0.035, 0.04, 0.96),
      trail: [],
    };
  }

  flies.push(fly);
  addEvent("agent", `Spawned ${fly.name} in the browser worker.`);
  return publicFly(fly);
}

function forkFly(sourceId: string) {
  const source = findFly(sourceId);
  const id = uid("fly", nextFly++);
  const copy: LocalFly = {
    ...clone(source),
    id,
    name: `${source.name} FORK`,
    is_prime: false,
    x: clamp(source.x + 0.03, 0.04, 0.96),
    y: clamp(source.y + 0.03, 0.04, 0.96),
    trail: [],
  };
  flies.push(copy);
  addEvent("agent", `Forked ${source.name} → ${copy.name}.`);
  return publicFly(copy);
}

function applyIntervention(fly: LocalFly, body: any) {
  const kind = String(body?.type ?? "");
  const target = String(body?.target ?? "");
  const row = {
    type: kind,
    target: target || null,
    amount: Number(body?.amount ?? 0.8),
    fraction: Number(body?.fraction ?? 0.1),
    seed: Number(body?.seed ?? 64),
    time: t,
    active: true,
  };

  if (kind === "silence_population" && target && !fly.silenced.includes(target)) {
    fly.silenced.push(target);
  } else if (kind === "restore_population" && target) {
    fly.silenced = fly.silenced.filter((name) => name !== target);
  } else if (kind === "stimulate_population") {
    challenge.actions += 1;
    fly.dn_activity = clamp(fly.dn_activity + Number(body?.amount ?? 0.8) * 0.08);
  } else if (kind === "random_synapse_lesion") {
    fly.lesionFraction = clamp(fly.lesionFraction + Number(body?.fraction ?? 0.1), 0, 0.9);
    unlockAchievement("chaos_theory", "CHAOS THEORY", "Applied a seeded random lesion.");
  }

  fly.interventions = [...fly.interventions, row];
  unlockAchievement("brain_surgeon", "BRAIN SURGEON", "Applied a neural intervention.");
  addEvent("neural", `${fly.name}: ${kind}${target ? ` ${target}` : ""}.`);
  return row;
}

function runConsole(command: string) {
  const parts = command.trim().split(/\s+/);
  if (!parts[0]) return { ok: true };

  const verb = parts[0].toLowerCase();
  if (verb === "pause") running = false;
  else if (verb === "resume" || verb === "play") running = true;
  else if (verb === "fork") return forkFly("prime");
  else if (verb === "random") return randomWorld(Number(parts[1] ?? world.seed));
  else if (verb === "challenge") {
    challenge = challengeState(parts[1] ?? "sandbox");
    return clone(challenge);
  } else if (verb === "spawn") {
    return addWorldObject({
      kind: parts[1] ?? "food",
      x: Number(parts[2] ?? 0.5),
      y: Number(parts[3] ?? 0.5),
    });
  } else if (verb === "stim" || verb === "silence" || verb === "restore") {
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

async function rpc(method: RpcRequest["method"], rawPath: string, body?: any) {
  const { path, query } = parsePath(rawPath);

  if (method === "GET") {
    if (path === "/api/state") return framePayload();
    if (path === "/api/metadata") return metadata();
    if (path === "/api/experiments/export") {
      return {
        runtime: "browser-worker-compatibility",
        exported_at: new Date().toISOString(),
        state: snapshot(),
      };
    }

    let match = path.match(/^\/api\/populations\/([^/]+)$/);
    if (match) return { populations: populationStatus(findFly(match[1])) };

    match = path.match(/^\/api\/brain\/([^/]+)\/sample$/);
    if (match) {
      findFly(match[1]);
      return {
        kind: "mock-unavailable",
        projection: null,
        mapped: 0,
        neurons: NEURONS,
        points: [],
      };
    }
  }

  if (method === "POST") {
    if (path === "/api/simulation/resume") {
      running = true;
      return { running };
    }
    if (path === "/api/simulation/pause") {
      running = false;
      return { running };
    }
    if (path === "/api/simulation/step") {
      advance(DT);
      emitFrame();
      return framePayload();
    }
    if (path === "/api/simulation/reset") {
      const wasRunning = running;
      t = 0;
      world = makeWorld(world.seed);
      flies = [makeFly("prime", "PRIME", true, "fly")];
      events = [{ t: 0, kind: "system", message: "Browser sandbox reset." }];
      couplings = [];
      achievements = [];
      checkpoints = [];
      challenge = challengeState("sandbox");
      running = wasRunning;
      emitFrame();
      return framePayload();
    }

    let match = path.match(/^\/api\/simulation\/speed\/([0-9.]+)$/);
    if (match) {
      const next = Number(match[1]);
      if (![0.05, 0.25, 1, 2, 5, 10].includes(next)) {
        throw new Error("Speed must be 0.05, 0.25, 1, 2, 5, or 10");
      }
      speed = next;
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
      if (!BODIES.includes(bodyType)) throw new Error(`Unknown body: ${bodyType}`);
      fly.body_type = bodyType;
      return { ok: true, body_type: bodyType };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/controller\/([^/]+)$/);
    if (match) {
      const fly = findFly(match[1]);
      const controller = match[2] as Controller;
      if (!["play", "lab"].includes(controller)) throw new Error("Unknown controller");
      fly.controller = controller;
      return { ok: true, controller };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/move$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.x = clamp(Number(query.get("x") ?? fly.x), 0.02, 0.98);
      fly.y = clamp(Number(query.get("y") ?? fly.y), 0.02, 0.98);
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/drive$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.manualTurn = clamp(Number(body?.turn ?? 0), -1, 1);
      fly.manualThrottle = clamp(Number(body?.throttle ?? 0), -1, 1);
      fly.manualUntil = t + 0.2;
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)\/interventions$/);
    if (match) return applyIntervention(findFly(match[1]), body);

    match = path.match(/^\/api\/flies\/([^/]+)\/sensory-gain\/([0-9.]+)$/);
    if (match) {
      const fly = findFly(match[1]);
      fly.sensoryGain = clamp(Number(match[2]), 0, 2);
      return { gain: fly.sensoryGain };
    }

    if (path === "/api/world/environment") {
      world.daylight = clamp(Number(body?.daylight ?? world.daylight), 0, 1);
      world.wind_x = Number(body?.wind_x ?? world.wind_x);
      world.wind_y = Number(body?.wind_y ?? world.wind_y);
      return framePayload();
    }

    if (path === "/api/world") return addWorldObject(body ?? {});

    match = path.match(/^\/api\/world\/([^/]+)\/move$/);
    if (match) {
      const obj = world.objects.find((item) => item.id === match[1]);
      if (!obj) throw new Error(`Unknown world object: ${match[1]}`);
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
      const coupling = {
        source: String(body?.source ?? "prime"),
        target: String(body?.target ?? ""),
        population: String(body?.population ?? "LC10a"),
        gain: Number(body?.gain ?? 0.5),
        kind: "browser-compatibility",
      };
      couplings.push(coupling);
      return clone(coupling);
    }

    if (path === "/api/challenges/mystery/reveal") {
      mysteryRevealed = true;
      challenge.secret_hidden = false;
      return { secret: "Browser compatibility runtime does not hide a real neural intervention yet." };
    }

    match = path.match(/^\/api\/challenges\/([^/]+)$/);
    if (match) {
      challenge = challengeState(match[1]);
      addEvent("challenge", `Started ${challenge.name}.`);
      return clone(challenge);
    }

    if (path === "/api/console") return runConsole(String(body?.command ?? ""));

    if (path === "/api/time/checkpoint") {
      const checkpoint: Checkpoint = {
        id: uid("cp", nextCheckpoint++),
        label: String(body?.label ?? `T+${t.toFixed(2)}`),
        t,
        snapshot: snapshot(),
      };
      checkpoints.push(checkpoint);
      if (checkpoints.length > 12) checkpoints = checkpoints.slice(-12);
      return { id: checkpoint.id, label: checkpoint.label, t: checkpoint.t };
    }

    if (path === "/api/time/rewind") {
      const requested = query.get("checkpoint_id") ?? body?.checkpoint_id;
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
      return {
        mock: true,
        population: String(body?.population ?? "LC4"),
        population_neurons: POPULATIONS[String(body?.population ?? "LC4")] ?? 0,
        steps: Number(body?.steps ?? 50),
        replicates: Number(body?.replicates ?? 4),
        seed: Number(body?.seed ?? world.seed),
        summary: { mean_dn_trace: 0, sd_dn_trace: 0 },
      };
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
      world.objects = world.objects.filter((obj) => obj.id !== match[1]);
      return { ok: true };
    }

    match = path.match(/^\/api\/flies\/([^/]+)$/);
    if (match) {
      if (match[1] === "prime") throw new Error("PRIME cannot be removed");
      flies = flies.filter((fly) => fly.id !== match[1]);
      return { ok: true };
    }
  }

  throw new Error(`Unsupported browser API route: ${method} ${rawPath}`);
}

scope.onmessage = async (event: MessageEvent<InboundMessage>) => {
  const message = event.data;

  if (message.type === "subscribe") {
    frameSubscribers += 1;
    scope.postMessage(framePayload());
    return;
  }

  if (message.type === "close") {
    running = false;
    scope.close?.();
    return;
  }

  if (message.type === "rpc") {
    try {
      const data = await rpc(message.method, message.path, message.body);
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
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

setInterval(() => {
  if (running) advance(DT * speed);
  emitFrame();
}, 50);
