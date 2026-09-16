// A stand-in for the `muse` command. `--version` prints a version line, and
// `serve` speaks enough of the Muse Session Protocol over stdio for the host
// tests: one session, turns with one tool call and one answer, interrupts,
// resume, and model changes. HARNESS_FIXTURE_BEHAVIOR selects a failure.
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const behavior = process.env.HARNESS_FIXTURE_BEHAVIOR;
if (args[0] === "--version") {
	process.stdout.write(`Muse Code ${process.env.HARNESS_FIXTURE_MUSE_VERSION ?? "1.3.0"} (build fixture)\n`);
	process.exit(0);
}
if (args[0] !== "serve") throw new Error(`Unexpected muse fixture arguments: ${args.join(" ")}`);
if (behavior === "crash") process.exit(7);
const sessionId = "provider-muse";
let model = "muse-spark-1.3";
let turn = 0;
let activeTurn = "";
const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method: string, params: object) => write({ jsonrpc: "2.0", method, params: { sessionId, ...params } });
const item = (value: object) => ({ turnId: activeTurn, revision: 1, status: "completed", ...value });
const complete = (terminal: string) => {
	if (terminal === "completed")
		notify("item/completed", {
			item: item({ itemId: `answer-${turn}`, kind: "agentMessage", text: "fixture response" }),
		});
	notify("turn/completed", { turnId: activeTurn, terminal, viewCursor: `v:${turn}` });
};
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
	if (line.trim() === "") return;
	const request = JSON.parse(line);
	const reply = (result: unknown) => write({ jsonrpc: "2.0", id: request.id, result });
	switch (request.method) {
		case "initialize":
			return reply({
				serverInfo: { name: "muse", version: "1.3.0" },
				schema: { version: 1, fingerprint: "sha256:fixture" },
				museHome: "/tmp/muse-fixture",
				grantedCapabilities: [],
				experimentalApi: false,
			});
		case "initialized":
			return;
		case "session/start":
			model = request.params.modelId ?? model;
			return reply({
				session: { sessionId, status: "idle", activeTurnId: null, modelId: model, providerId: "meta" },
				viewCursor: "v:0",
			});
		case "session/resume":
			return reply({
				session: { sessionId: request.params.sessionId, status: "idle", activeTurnId: null, modelId: model },
				history: { mode: "none" },
				pendingRequests: [],
				viewCursor: "v:0",
			});
		case "session/setModel":
			model = request.params.model.modelId;
			reply({ commandId: request.params.commandId, status: "accepted" });
			return notify("session/modelChanged", { modelId: model, source: "user" });
		case "view/subscribe":
			return reply({ viewCursor: "v:0" });
		case "model/list":
			return reply({ providerId: "meta", profileId: null, source: "providerCatalog", models: [] });
		case "turn/interrupt":
			reply({ commandId: request.params.commandId, status: "accepted" });
			return complete(behavior === "normal-interrupt" ? "completed" : "cancelled");
		case "turn/start": {
			activeTurn = `turn-${++turn}`;
			reply({
				commandId: request.params.commandId,
				status: "accepted",
				turnId: activeTurn,
				startedNewTurn: true,
				disposition: "started",
			});
			if (behavior === "silent") return;
			notify("turn/started", { turnId: activeTurn, commandId: request.params.commandId });
			notify("item/completed", {
				item: item({ itemId: `user-${turn}`, kind: "userMessage", text: request.params.input[0].text }),
			});
			notify("item/started", {
				item: item({
					itemId: `tool-${turn}`,
					kind: "toolCall",
					status: "inProgress",
					tool: "bash",
					args: '{"command":"pwd"}',
				}),
			});
			if (["busy", "normal-interrupt"].includes(behavior!)) return;
			notify("item/completed", {
				item: item({ itemId: `tool-${turn}`, kind: "toolCall", tool: "bash", visibleOutput: "/tmp" }),
			});
			return complete("completed");
		}
		default:
			return write({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Unknown ${request.method}` } });
	}
});
lines.once("close", () => process.exit(0));
