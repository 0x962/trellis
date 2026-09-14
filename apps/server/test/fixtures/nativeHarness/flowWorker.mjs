#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

if (process.argv.includes("--version")) {
	process.stdout.write("2.1.270 (Claude Code)\n");
	process.exit(0);
}
const sessionId = process.argv[process.argv.indexOf("--session-id") + 1];
const emit = (row) => process.stdout.write(`${JSON.stringify(row)}\n`);
createInterface({ input: process.stdin }).on("line", (line) => {
	const row = JSON.parse(line);
	if (row.type === "control_request")
		emit({ type: "control_response", response: { subtype: "success", request_id: row.request_id, response: {} } });
	if (row.type === "user") {
		emit({ ...row, isReplay: true });
		if (row.message.content.includes("WAIT_FOREVER")) return;
		const result = row.message.content.includes("Answer the condition with exactly YES or NO")
			? "YES"
			: "Flow fixture output";
		writeFileSync("flow-artifact.txt", result);
		emit({
			type: "assistant",
			uuid: randomUUID(),
			session_id: sessionId,
			message: { content: [{ type: "text", text: result }] },
		});
		emit({ type: "result", uuid: randomUUID(), session_id: sessionId, subtype: "success", is_error: false, result });
	}
});
