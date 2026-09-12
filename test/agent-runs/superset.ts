#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const dir = dirname(process.argv[1]!);
const args = process.argv.slice(2);
appendFileSync(join(dir, "calls.jsonl"), `${JSON.stringify(args)}\n`);
if (existsSync(join(dir, "fail"))) {
	process.stderr.write("Superset is unavailable");
	process.exit(1);
}
if (args[0] === "projects")
	console.log(
		JSON.stringify([{ id: "superset-project", name: "Example", repo: "https://github.com/example/code", path: dir }]),
	);
else if (args[0] === "ws" && args[1] === "list") console.log(readFileSync(join(dir, "workspaces.json"), "utf8"));
else if (args[0] === "terminals" && args[1] === "create")
	console.log(JSON.stringify({ terminalId: "resumed-terminal" }));
else if (args[1] === "create") {
	const id = crypto.randomUUID();
	writeFileSync(join(dir, "workspaces.json"), JSON.stringify([{ id, branch: args[args.indexOf("--branch") + 1] }]));
	console.log(JSON.stringify({ workspace: { id }, terminals: [{ terminalId: "terminal", label: "Command" }] }));
} else if (args[1] === "open") console.log(`superset://workspace/${args[2]}`);
else if (args[1] === "list")
	console.log(
		JSON.stringify({ sessions: [{ terminalId: "terminal", exited: existsSync(join(dir, "exited")), title: "Agent" }] }),
	);
else if (args[1] === "send") console.log("{}");
else if (args[1] === "read") console.log("Agent output");
else if (args[1] === "close") console.log("{}");
else throw new Error(`Unknown command: ${args.join(" ")}`);
