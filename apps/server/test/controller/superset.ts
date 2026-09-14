#!/usr/bin/env bun
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const home = process.env.TRELLIS_HOME!;
const args = process.argv.slice(2);
appendFileSync(join(home, "commands.jsonl"), `${JSON.stringify(args)}\n`);
const command = `${args[0]} ${args[1]}`;
if (command === "projects list")
	console.log(JSON.stringify([{ id: "project", repo: "https://github.com/example/code" }]));
else if (command === "hosts list")
	console.log(JSON.stringify([{ id: "local", name: "This machine", online: "local" }]));
else if (command === "ws create")
	console.log(
		JSON.stringify({
			workspace: { id: crypto.randomUUID() },
			terminals: [{ terminalId: crypto.randomUUID(), label: "Command" }],
		}),
	);
else if (command === "ws open") console.log(`superset://workspace/${args[2]}`);
else if (command === "terminals send") {
	const holding = existsSync(join(home, "hold-send"));
	appendFileSync(join(home, "sends.jsonl"), `${JSON.stringify({ pid: process.pid, args, holding })}\n`);
	if (holding) await new Promise((resolve) => setTimeout(resolve, 120_000));
	console.log("{}");
} else if (command === "terminals list") console.log(JSON.stringify({ sessions: [] }));
else if (command === "terminals read") console.log("Test output");
else if (command === "terminals close") console.log("{}");
else throw new Error(`Unexpected test command: ${command}`);
