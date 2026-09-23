import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

// A fake `muse serve` for the bridge tests. It answers the Muse Session
// Protocol requests that the bridge sends while it starts. The bridge
// reports the prompt receipt and the agent message to the runtime, so a
// test runtime that refuses the agent message makes the event chain of
// the bridge reject.
//
// `TRELLIS_TEST_TURN_LOG` names a file that takes one line per `turn/start`.
// A test that types into the terminal of the bridge counts those lines.
//
// `TRELLIS_TEST_EXIT_AFTER_PROMPT` makes this host stop after it sends the
// prompt receipt. The bridge then fails from the closed host while its write
// of the prompt event is still in flight.
const sessionId = "session-under-test";
const turnId = "turn-under-test";
const turnLog = process.env.TRELLIS_TEST_TURN_LOG;
const exitAfterPrompt = process.env.TRELLIS_TEST_EXIT_AFTER_PROMPT === "1";
const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
const notify = (method: string, params: unknown) => write({ jsonrpc: "2.0", method, params });
const item = (itemId: string, kind: string, extra: Record<string, unknown>) => ({
	sessionId,
	turnId,
	item: { itemId, kind, status: "completed", turnId, ...extra },
});
let turns = 0;
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
		turns += 1;
		if (turnLog !== undefined) appendFileSync(turnLog, `${turns}\n`);
		write({ jsonrpc: "2.0", id: message.id, result: { turnId, disposition: "started" } });
		notify(
			"item/completed",
			item(`user-${turns}`, "userMessage", { commandId: message.params?.commandId, text: "do the work" }),
		);
		if (exitAfterPrompt) process.exit(0);
		notify("item/completed", item("agent-1", "agentMessage", { text: "The work is done." }));
	}
});
