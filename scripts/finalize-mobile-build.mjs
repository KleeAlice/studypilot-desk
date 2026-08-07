import { access, rename } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist-mobile");
const mobileEntry = resolve(output, "mobile.html");
const capacitorEntry = resolve(output, "index.html");

await access(mobileEntry);
await rename(mobileEntry, capacitorEntry);
await access(capacitorEntry);
console.log(`StudyPilot Mobile web bundle ready: ${capacitorEntry}`);
