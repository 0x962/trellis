import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { ensureNativeRuntime } from "../agents/native/connection.ts";

export const terminalStreamRuntime = async (
	home: string,
	ensureRuntime: typeof ensureNativeRuntime = ensureNativeRuntime,
) => {
	let client: Awaited<ReturnType<typeof ensureNativeRuntime>>;
	try {
		client = await ensureRuntime(home);
	} catch (error) {
		if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: "The supervised execution service is stopped.",
			data: { reason: "host" },
		});
	}
	if (!(await client.hello()).capabilities?.includes("terminal-stream"))
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: "The execution service requires an update before it can stream this terminal.",
			data: { reason: "outdated" },
		});
	return client;
};
