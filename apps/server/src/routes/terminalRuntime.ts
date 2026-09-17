import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { ensureNativeRuntime } from "../agents/native/connection.ts";

// Starts the native runtime process and returns its client, for a route
// that reads the output of a terminal. A runtime binary that was built
// before the `terminal-stream` capability cannot send that output. The
// request itself is correct, so the answer names the runtime and not the
// input.
export const terminalStreamRuntime = async (home: string) => {
	const client = await ensureNativeRuntime(home);
	if (!(await client.hello()).capabilities?.includes("terminal-stream"))
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: "The execution service requires an update before it can stream this terminal.",
			data: { reason: "outdated" },
		});
	return client;
};
