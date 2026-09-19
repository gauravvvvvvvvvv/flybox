export type WorldKind =
  | "food"
  | "odor"
  | "stimulus"
  | "obstacle"
  | "loom"
  | "sound"
  | "predator"
  | "light"
  | "goal";

export type ArenaObject = {
  id: string;
  kind: WorldKind;
  x: number;
  y: number;
  intensity: number;
  radius: number;
  amount: number;
  vx: number;
  vy: number;
  label?: string | null;
};

export type Achievement = {
  key: string;
  title: string;
  description: string;
};

export type HistoryExperiment = {
  phase: "exposure" | "test" | "complete";
  a: string;
  b: string;
  a_history: string;
  b_history: string;
  exposure_started: number;
  exposure_ends: number;
  exposure_duration: number;
  test_started?: number;
  test_ends?: number;
  test_duration: number;
  samples: number;
  neural_now: number;
  spatial_now: number;
  neural_max: number;
  spatial_max: number;
  result?: {
    mean_neural_divergence: number;
    max_neural_divergence: number;
    max_behavioral_divergence: number;
    samples: number;
    interpretation: string;
  } | null;
  claim: string;
};

export type ChallengeState = {
  id: string;
  name: string;
  description: string;
  goal: string;
  target?: number;
  budget?: number;
  started: number;
  elapsed: number;
  completed: boolean;
  winner?: string | null;
  actions: number;
  secret_hidden: boolean;
  history?: HistoryExperiment | null;
};

export type FlyFrame = {
  id: string;
  name: string;
  is_prime: boolean;
  body_type: "fly" | "car" | "bot" | "drone" | "walker" | "ship" | "synth";
  controller: "play" | "lab";
  state: string;
  alive: boolean;
  x: number;
  y: number;
  heading: number;
  speed: number;
  energy: number;
  hunger: number;
  food_eaten: number;
  escape_events: number;
  fired_count: number;
  firing_fraction: number;
  newly_firing: number;
  firing_jaccard_distance: number;
  dn_activity: number;
  dn_fired: number;
  motor: Record<string, number>;
  senses: Record<string, number>;
  assists: Record<string, number>;
  trail: { t: number; x: number; y: number }[];
  sampled_fired: number[];
  brain_view: {
    kind: string;
    mapped: number;
    firing_positions: [number, number, number, number][];
  };
  interventions: Array<Record<string, unknown>>;
};

export type Frame = {
  type: "frame";
  t: number;
  running: boolean;
  speed: number;
  mock: boolean;
  flies: FlyFrame[];
  world: { seed: number; daylight: number; wind_x: number; wind_y: number; objects: ArenaObject[] };
  events: { t: number; kind: string; message: string }[];
  challenge: ChallengeState;
  achievements: Achievement[];
  couplings: { source: string; target: string; population: string; gain: number; kind: string }[];
  comparisons: { a: string; b: string; a_name: string; b_name: string; neural_divergence: number; behavioral_divergence: number; energy_delta: number }[];
  checkpoints: { id: string; label: string; t: number }[];
};

export type Metadata = {
  neurons: number;
  synapses: number;
  dt: number;
  max_flies: number;
  mock: boolean;
  bodies: string[];
  challenges: Record<string, { name: string; description: string; goal: string; target?: number; budget?: number }>;
  provenance: Record<string, { label: string; description: string }>;
  sensory_provenance: Record<string, unknown>;
  motor_provenance: Record<string, unknown>;
  motor_mapping: string;
};
