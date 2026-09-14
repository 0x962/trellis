#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

if (process.argv.includes("--version")) {
	process.stdout.write("2.1.270 (Claude Code)\n");
	process.exit(0);
}
const sessionId = process.argv[process.argv.indexOf("--session-id") + 1];
const emit = (row) => process.stdout.write(`${JSON.stringify(row)}\n`);
const result = (text) =>
	emit({ type: "result", session_id: sessionId, subtype: "success", is_error: false, result: text });
createInterface({ input: process.stdin }).on("line", (line) => {
	const row = JSON.parse(line);
	if (row.type === "control_request") {
		emit({ type: "control_response", response: { subtype: "success", request_id: row.request_id, response: {} } });
	} else if (row.type === "user") {
		emit({ ...row, isReplay: true });
		if (row.message.content === "request tool") {
			emit({
				type: "control_request",
				request_id: "fixture-permission",
				request: {
					subtype: "can_use_tool",
					tool_name: "Write",
					input: { file_path: "artifact.txt", content: "Fixture output\n" },
				},
			});
		} else {
			emit({
				type: "assistant",
				session_id: sessionId,
				message: { content: [{ type: "text", text: "Fixture turn completed." }] },
			});
			result("Fixture turn completed.");
		}
	} else if (row.type === "control_response") {
		emit(row);
		if (row.response.response.behavior === "allow") {
			writeFileSync("artifact.txt", "Fixture output\n");
			result("Artifact created.");
		} else {
			emit({
				type: "result",
				session_id: sessionId,
				subtype: "success",
				permission_denials: [{ tool_name: "Write" }],
				result: "Permission denied.",
			});
		}
	}
});
