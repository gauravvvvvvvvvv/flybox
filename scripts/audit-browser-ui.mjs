import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const app = read("frontend/src/App.tsx");
const arena = read("frontend/src/Arena.tsx");
const brain = read("frontend/src/BrainView.tsx");
const api = read("frontend/src/api.ts");
const worker = read("frontend/src/simulation.worker.ts");
const types = read("frontend/src/types.ts");
const vercel = JSON.parse(read("vercel.json"));

const failures = [];
const requireText = (name, content, needle) => {
  if (!content.includes(needle)) failures.push(`${name}: missing ${needle}`);
};
const forbidText = (name, content, needle) => {
  if (content.includes(needle)) failures.push(`${name}: stale/forbidden ${needle}`);
};

for (const forbidden of [
  "WebSocket",
  "localhost:8000",
  "VITE_SIMULATION_RUNTIME",
  "VITE_API_URL",
  "VITE_WS_URL",
]) {
  forbidText("browser API", api, forbidden);
}
for (const required of [
  'browserRpc("GET"',
  'browserRpc("POST"',
  'browserRpc("DELETE"',
  "connectBrowserFrames",
  "closeBrowserRuntime",
]) {
  requireText("browser API", api, required);
}

for (const forbidden of ["cameraCenter", "zoom"]) {
  forbidText("play arena", arena, forbidden);
}
for (const required of [
  "onPointerDown={onPointerDown}",
  "onContextMenu={onContextMenu}",
  "onPlace(tool, p.x, p.y)",
  "onRemoveObject(hit.id)",
  "onMoveObject(dragObject.current",
  "onMoveFly(dragFly.current",
]) {
  requireText("play arena", arena, required);
}

const worldKinds = [
  "food", "odor", "stimulus", "obstacle", "loom",
  "sound", "predator", "light", "goal",
];
for (const kind of worldKinds) {
  requireText("world type", types, `"${kind}"`);
  requireText("world toolbar", app, `kind: "${kind}"`);
}
for (const required of [
  'if (path === "/api/world") return addWorldObject',
  '/^\\/api\\/world\\/([^/]+)\\/move$/',
  '/^\\/api\\/world\\/([^/]+)$/',
  'if (path === "/api/world/randomize")',
  'if (path === "/api/world/daily")',
  'if (path === "/api/world/environment")',
]) {
  requireText("world worker", worker, required);
}

const bodies = ["fly", "car", "bot", "drone", "walker", "ship", "synth"];
for (const body of bodies) {
  requireText("body controls", app, `"${body}"`);
  requireText("body worker", worker, `"${body}"`);
  if (body !== "fly") requireText("body renderer", arena, `body === "${body}"`);
}

const challengeIds = [
  "food_run", "survive", "hunt", "race", "braincar",
  "maze", "tournament", "hijack", "mystery", "history", "sandbox",
];
for (const id of challengeIds) {
  requireText("challenge UI", app, `["${id}",`);
  requireText("challenge worker", worker, `  ${id}: {`);
}
for (const required of [
  "function startChallenge(id: string)",
  "function advanceHistoryExperiment()",
  'path === "/api/challenges/mystery/reveal"',
  "return startChallenge(match[1])",
]) {
  requireText("challenge runtime", worker, required);
}

for (const required of [
  'path === "/api/simulation/resume"',
  'path === "/api/simulation/pause"',
  'path === "/api/simulation/step"',
  'path === "/api/simulation/reset"',
  '/^\\/api\\/simulation\\/speed\\/([0-9.]+)$/',
  'if (path === "/api/flies") return spawnFly',
  '/^\\/api\\/flies\\/([^/]+)\\/fork$/',
  '/^\\/api\\/flies\\/([^/]+)\\/rename$/',
  '/^\\/api\\/flies\\/([^/]+)\\/body\\/([^/]+)$/',
  '/^\\/api\\/flies\\/([^/]+)\\/controller\\/([^/]+)$/',
  '/^\\/api\\/flies\\/([^/]+)\\/drive$/',
  '/^\\/api\\/flies\\/([^/]+)\\/interventions$/',
  '/^\\/api\\/flies\\/([^/]+)\\/sensory-gain\\/([0-9.]+)$/',
  'path === "/api/couplings"',
  'path === "/api/time/checkpoint"',
  'path === "/api/time/rewind"',
  'path === "/api/experiments/export"',
  'path === "/api/batch/probe"',
  '/^\\/api\\/brain\\/([^/]+)\\/sample$/',
]) {
  requireText("worker route", worker, required);
}

for (const required of [
  'surface === "PLAY"',
  'surface === "LAB"',
  'surface === "BUILD"',
  'surface === "WEIRD"',
  "<BrainView",
  "<ChallengePanel",
  "chaosBrain",
  "lesion_fraction",
]) {
  requireText("lab UI", app, required);
}
for (const required of [
  'get(\`/api/brain/\${fly.id}/sample\`)',
  "onPointerDown={pointerDown}",
  "onPointerMove={pointerMove}",
  "onWheel={wheel}",
  "setExpanded(!expanded)",
]) {
  requireText("brain view", brain, required);
}

if (existsSync(resolve(root, "Dockerfile.vercel"))) {
  failures.push("deployment: Dockerfile.vercel must not exist");
}
if (vercel.framework !== "vite") failures.push("deployment: Vercel framework must be vite");
if (vercel.outputDirectory !== "frontend/dist") {
  failures.push("deployment: Vercel output must be frontend/dist");
}
if (vercel.functions || vercel.builds) {
  failures.push("deployment: static FlyBox must not define Vercel functions/builds");
}

if (failures.length) {
  console.error("FLYBOX browser audit failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("FLYBOX browser audit passed.");
console.log("  static Vite deployment");
console.log("  browser-only RPC/runtime");
console.log("  arena placement/drag/right-click wiring");
console.log("  9 world tools");
console.log("  7 body types");
console.log("  11 challenges");
console.log("  simulation/intervention/time-machine/brain-view routes");
