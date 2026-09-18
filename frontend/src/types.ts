export type ArenaObject = {
  id: string;
  kind: "food" | "stimulus" | "obstacle" | "loom";
  x: number;
  y: number;
  intensity: number;
  radius: number;
};

export type FlyFrame = {
  id: string;
  name: string;
  is_prime: boolean;
  x: number;
  y: number;
  heading: number;
  speed: number;
  energy: number;
  fired_count: number;
  firing_fraction: number;
  newly_firing: number;
  firing_jaccard_distance: number;
  dn_activity: number;
  dn_fired: number;
  sensory_targets: number;
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
};
