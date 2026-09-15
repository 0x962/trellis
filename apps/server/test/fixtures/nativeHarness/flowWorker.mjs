#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const settings = JSON.parse(process.argv[process.argv.indexOf("--settings") + 1]);
const sessionIndex = process.argv.indexOf("--session-id");
const sessionId = process.argv[sessionIndex + 1];
const initialPrompt = process.argv.at(-1);
const hook = (name, extra = {}) => {
	const command = settings.hooks[name][0].hooks[0].command;
	const result = spawnSync(command, {
		shell: "/bin/sh",
		input: JSON.stringify({ hook_event_name: name, session_id: sessionId, ...extra }),
		encoding: "utf8",
	});
	if (result.status !== 0) throw new Error(result.stderr);
};
const turn = (prompt) => {
	hook("UserPromptSubmit", { prompt });
	if (prompt.includes("WAIT_FOREVER")) return;
	const result = prompt.includes("Answer the condition with exactly YES or NO") ? "YES" : "Flow fixture output";
	writeFileSync("flow-artifact.txt", result);
	process.stdout.write(`${result}\r\n`);
	hook("Stop", { last_assistant_message: result });
};
process.stdin.setRawMode(true);
let pending = "";
process.stdin.on("data", (bytes) => {
	pending += bytes.toString();
	const end = pending.indexOf("\x1b[201~\r");
	if (end === -1) return;
	const prompt = pending.slice(pending.startsWith("\x1b[200~") ? 6 : 0, end);
	pending = pending.slice(end + 7);
	turn(prompt);
});
hook("SessionStart");
turn(initialPrompt);
