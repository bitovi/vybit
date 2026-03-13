#!/usr/bin/env node
// Entry point — runs the TypeScript server directly via tsx (no build step needed)
import { register } from "tsx/esm/api";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

register();

await import(path.join(__dirname, "server", "index.ts"));
