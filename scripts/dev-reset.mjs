// Wipes local Durable Object storage (the dev SQLite database). Content re-syncs on the next request.
import { rmSync } from "node:fs";

rmSync(".wrangler/state/v3/do", { recursive: true, force: true });
console.log("Local Durable Object state removed. Restart `pnpm dev`.");
