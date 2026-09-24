import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PINNED_REVISION = "03358c075000af5379e405b244dd31f1a0fd1401";
const DEFAULT_SOURCE =
  `https://raw.githubusercontent.com/alextitonis/fly.ai/${PINNED_REVISION}/world/public/connectome/`;
const source = (process.env.FLYBOX_CONNECTOME_SOURCE ?? DEFAULT_SOURCE).replace(/\/?$/, "/");
const destination = fileURLToPath(new URL("../frontend/public/connectome/", import.meta.url));

async function fetchBytes(name) {
  const response = await fetch(source + name, { redirect: "follow" });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

await mkdir(destination, { recursive: true });

const manifestResponse = await fetch(source + "brain.json", { redirect: "follow" });
if (!manifestResponse.ok) throw new Error(`brain.json: HTTP ${manifestResponse.status}`);
const manifestText = await manifestResponse.text();
const manifest = JSON.parse(manifestText);

if (manifest.neurons !== 166700 || manifest.connections < 20_000_000) {
  throw new Error(
    `Unexpected FlyBrain export: ${manifest.neurons} neurons / ${manifest.connections} connections`,
  );
}
if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) {
  throw new Error("FlyBrain export manifest contains no weight parts");
}

await writeFile(destination + "brain.json", manifestText);
for (const name of ["meta.bin", ...manifest.parts]) {
  const bytes = await fetchBytes(name);
  await writeFile(destination + name, bytes);
  console.log(`${name}: ${(bytes.byteLength / 1e6).toFixed(2)} MB`);
}

console.log(`Browser connectome copied to ${destination}`);
console.log("Set VITE_CONNECTOME_BASE=/connectome/ to serve it from the same static origin.");
