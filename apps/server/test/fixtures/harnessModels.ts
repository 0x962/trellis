import { basename } from "node:path";

// A stand-in for a harness program that answers only the model query. The
// file name of the launcher script names the harness: `bin/claude` answers as
// claude. Each answer matches the shape of the real program, on the stream
// the real program uses.

const harness = basename(process.argv[1]!);
const args = process.argv.slice(2);
const stdin = async () => await Bun.stdin.text();

if (harness === "claude") {
	const request = JSON.parse((await stdin()).trim());
	process.stdout.write(`${JSON.stringify({ type: "system", subtype: "hook_started", hook_name: "SessionStart" })}\n`);
	process.stdout.write(
		`${JSON.stringify({
			type: "control_response",
			response: {
				subtype: "success",
				request_id: request.request_id,
				response: {
					commands: [],
					models: [
						{ value: "default", resolvedModel: "claude-opus-5[1m]", displayName: "Default (recommended)" },
						{ value: "opus[1m]", resolvedModel: "claude-opus-5[1m]", displayName: "Opus (1M context)" },
						{ value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet" },
					],
				},
			},
		})}\n`,
	);
} else if (harness === "codex") {
	if (args[0] !== "app-server") throw new Error(`codex fixture takes app-server, not ${args.join(" ")}`);
	const answers: Record<string, unknown> = {
		initialize: { userAgent: "codex-fixture" },
		"model/list": {
			data: [
				{ id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra", hidden: false, isDefault: true },
				{ id: "gpt-5.6-sol", model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", hidden: false, isDefault: false },
				{ id: "gpt-5.3-lab", model: "gpt-5.3-lab", displayName: "GPT-5.3-Lab", hidden: true, isDefault: false },
			],
			nextCursor: null,
		},
	};
	process.stdout.write(
		`${JSON.stringify({ method: "remoteControl/status/changed", params: { status: "disabled" } })}\n`,
	);
	let pending = "";
	for await (const chunk of process.stdin) {
		pending += Buffer.from(chunk).toString();
		const lines = pending.split("\n");
		pending = lines.pop()!;
		for (const text of lines) {
			const message = JSON.parse(text);
			if (message.id === undefined) continue;
			process.stdout.write(`${JSON.stringify({ id: message.id, result: answers[message.method] })}\n`);
		}
	}
} else if (harness === "opencode") {
	process.stdout.write("opencode/big-pickle\nopenai/gpt-5.5\nanthropic/claude-sonnet-5\n");
} else if (harness === "pi") {
	process.stderr.write(
		[
			"provider           model                           context  max-out  thinking  images",
			"anthropic          claude-sonnet-5                 1M       64K      yes       yes   ",
			"vercel-ai-gateway  anthropic/claude-fable-5        1M       128K     yes       yes   ",
			"",
		].join("\n"),
	);
} else {
	throw new Error(`No harness fixture is named ${harness}`);
}
