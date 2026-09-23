import { createInterface } from "node:readline";

// A fake `muse serve` for the bridge tests. It answers the Muse Session
// Protocol requests that the bridge sends while it starts. After the first
// turn starts, it sends the receipt of the prompt and one agent message. The
// bridge reports both to the runtime, so a test runtime that refuses the
// agent message makes the event chain of the bridge reject.
const sessionId = "session-under-test";
const turnId = "turn-under-test";
const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method: string, params: unknown) => write({ jsonrpc: "2.0", method, params });
const item = (itemId: string, kind: string, extra: Record<string, unknown>) => ({
	sessionId,
	turnId,
	item: { itemId, kind, status: "completed", turnId, ...extra },
});
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
	const message = JSON.parse(line) as { id?: number; method: string; params?: Record<string, unknown> };
	if (message.method === "initialize")
		write({
			jsonrpc: "2.0",
			id: message.id,
			result: { schema: { version: 1 }, museHome: process.env.TRELLIS_TEST_MUSE_HOME, grantedCapabilities: [] },
		});
	if (message.method === "session/start")
		write({ jsonrpc: "2.0", id: message.id, result: { session: { sessionId, modelId: null } } });
	if (message.method === "view/subscribe") write({ jsonrpc: "2.0", id: message.id, result: {} });
	if (message.method === "turn/start") {
		write({ jsonrpc: "2.0", id: message.id, result: { turnId, disposition: "started" } });
		notify(
			"item/completed",
			item("user-1", "userMessage", { commandId: message.params?.commandId, text: "do the work" }),
		);
		notify("item/completed", item("agent-1", "agentMessage", { text: "The work is done." }));
	}
});
