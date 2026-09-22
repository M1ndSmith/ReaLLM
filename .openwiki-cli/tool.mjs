#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { HostSessionManager } from "./node_modules/openwiki/dist/integrations/core/session-manager.js";

const ROOT = "/home/m1ndsmith/Desktop/ReaLMM";
const [name, json] = process.argv.slice(2);
if (!name) {
  console.error("usage: node tool.mjs <tool> [json]");
  process.exit(1);
}

const input = json
  ? JSON.parse(json.startsWith("{") || json.startsWith("[") ? json : readFileSync(json, "utf8"))
  : {};
const manager = HostSessionManager.create({ host: "cursor", producerActor: "cursor" });

if (name !== "openwiki_begin") {
  await manager.begin({ root: ROOT, mode: "init" });
}

const tool = manager.tools().find((entry) => entry.name === name);
if (!tool) {
  console.error(`unknown tool: ${name}`);
  process.exit(1);
}

const payload = name === "openwiki_begin" ? { root: ROOT, ...input } : input;
const result = await tool.handle(payload);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
