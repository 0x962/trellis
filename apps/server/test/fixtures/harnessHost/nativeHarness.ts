import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const statusFile = join(dirname(process.argv[1]!), "claude-status.json");
if (process.argv[2] === "agents") {
	process.stdout.write(readFileSync(statusFile, "utf8"));
	process.exit(0);
}
const harness = process.env.TRELLIS_HARNESS!;
const args = process.argv.slice(2);
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : "fixture-default";
const sessionFlag = {
	claude: "--resume",
	codex: "resume",
	pi: "--session",
	opencode: "--session",
	agy: "--conversation",
}[harness]!;
const resumed = args.includes(sessionFlag);
const sessionId = resumed
	? args[harness === "codex" ? args.indexOf("--") + 1 : args.indexOf(sessionFlag) + 1]!
	: `provider-${harness}`;
let sequence = Promise.resolve();
let outcome = "completed";
const native = (kind: string, prompt?: string) => {
	if (harness === "pi")
		return {
			harness,
			event: { session: "session_start", prompt: "input", idle: "agent_end", tool: "tool_execution_start" }[kind],
			sessionId,
			turnId: "fixture-turn",
			model,
			payload: {
				text: prompt,
				messages: [
					{
						role: "assistant",
						stopReason: outcome === "interrupted" ? "aborted" : "stop",
						content: [{ type: "text", text: "fixture result" }],
					},
				],
				toolCallId: "tool",
				toolName: "read",
				args: { path: "fixture" },
			},
		};
	if (harness === "opencode")
		return {
			harness,
			event: kind === "tool" ? "tool-start" : kind,
			sessionId,
			turnId: "fixture-turn",
			model,
			prompt,
			result: kind === "idle" && outcome === "completed" ? "fixture result" : undefined,
			outcome: kind === "idle" ? outcome : undefined,
			tool: kind === "tool" ? { id: "tool", name: "read", input: { path: "fixture" } } : undefined,
		};
	return {
		hook_event_name:
			kind === "idle" && harness === "codex" && outcome === "interrupted"
				? "Interrupt"
				: { session: "SessionStart", prompt: "UserPromptSubmit", idle: "Stop", tool: "PreToolUse" }[kind],
		session_id: sessionId,
		model,
		prompt,
		last_assistant_message: "fixture result",
		tool_use_id: "tool",
		tool_name: "read",
		tool_input: { path: "fixture" },
	};
};
const hook = (kind: string, prompt?: string) => {
	if (harness === "claude")
		writeFileSync(
			statusFile,
			JSON.stringify([{ pid: process.pid, sessionId, status: kind === "idle" ? "idle" : "working" }]),
		);
	if (process.env.HARNESS_FIXTURE_BEHAVIOR === "silent" || harness === "agy") return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const child = spawn(process.env.TRELLIS_HARNESS_HOOK!, [], { shell: true, stdio: ["pipe", "ignore", "inherit"] });
		child.once("error", reject);
		child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`hook exit ${code}`))));
		child.stdin.end(JSON.stringify(native(kind, prompt)));
	});
};
process.stdout.write(`${JSON.stringify({ args, model, sessionId })}\n`);
if (process.env.HARNESS_FIXTURE_BEHAVIOR === "crash") process.exit(7);
if (harness === "opencode")
	Bun.serve({
		unix: process.env.TRELLIS_OPENCODE_CONTROL_SOCKET!,
		async fetch(request) {
			if (request.headers.get("authorization") !== `Bearer ${process.env.TRELLIS_OPENCODE_CONTROL_TOKEN}`)
				return new Response("unauthorized", { status: 401 });
			const input = (await request.json()) as { sessionId: string; turnId: string };
			if (input.sessionId !== sessionId || input.turnId !== "fixture-turn")
				return new Response("stale", { status: 409 });
			outcome = process.env.HARNESS_FIXTURE_BEHAVIOR === "normal-interrupt" ? "completed" : "interrupted";
			await hook("idle");
			return Response.json({ accepted: true, sessionId, turnId: input.turnId });
		},
	});
process.stdin.setRawMode(true);
await hook("session");
const prompt = harness === "opencode" ? args[args.indexOf("--prompt") + 1]! : args.at(-1)!;
await hook("prompt", prompt);
if (!["busy", "normal-interrupt"].includes(process.env.HARNESS_FIXTURE_BEHAVIOR!)) await hook("idle");
process.stdin.resume();
let input = "";
process.stdin.on("data", (chunk: Buffer) => {
	input += chunk.toString().replaceAll("\x1b[200~", "").replaceAll("\x1b[201~", "");
	if (input.includes("\x03") || input.includes("\x1b")) {
		input = "";
		if (harness === "claude")
			writeFileSync(statusFile, JSON.stringify([{ pid: process.pid, sessionId, status: "idle" }]));
		else
			sequence = sequence.then(() => {
				outcome = process.env.HARNESS_FIXTURE_BEHAVIOR === "normal-interrupt" ? "completed" : "interrupted";
				return hook("idle");
			});
	} else if (input.endsWith("\r")) {
		const submitted = input.slice(0, -1);
		input = "";
		sequence = sequence.then(async () => {
			await hook("prompt", submitted);
			await hook("tool");
			process.stdout.write("fixture response\n");
			await hook("idle");
		});
	}
});
