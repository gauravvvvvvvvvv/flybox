export type WorldKind =
  | "food"
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
  interventions: Array<Record<string, unknown>>;
};

export type Frame = {
  type: "frame";
  t: number;
  running: boolean;
  speed: number;
  mock: boolean;
  flies: FlyFrame[];
  world: { seed: number; objects: ArenaObject[] };
  events: { t: number; kind: string; message: string }[];
  challenge: ChallengeState;
  achievements: Achievement[];
  couplings: { source: string; target: string; population: string; gain: number; kind: string }[];
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
