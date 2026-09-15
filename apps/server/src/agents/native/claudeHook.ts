import { join } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";

const event = JSON.parse(await Bun.stdin.text());
const client = new RuntimeClient(join(process.env.TRELLIS_RUNTIME_HOME!, "runtime.sock"));
const messageId =
	typeof event.prompt === "string" ? /^trellis-message:([0-9a-f-]+)\r?\n/.exec(event.prompt)?.[1] : undefined;
await client.turn(
	process.env.TRELLIS_ATTEMPT_ID!,
	process.env.TRELLIS_ATTEMPT_TOKEN!,
	event.hook_event_name,
	messageId,
	event.hook_event_name === "Stop" ? event.last_assistant_message : undefined,
);
