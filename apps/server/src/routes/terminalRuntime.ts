import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { ensureNativeRuntime } from "../agents/native/connection.ts";
import type { Logger } from "../log.ts";

export type TerminalStreamRuntimeOptions = {
	home: string;
	reqId: string;
	log: Pick<Logger, "warn">;
	ensureRuntime?: typeof ensureNativeRuntime;
};

export const terminalStreamRuntime = async ({
	home,
	reqId,
	log,
	ensureRuntime = ensureNativeRuntime,
}: TerminalStreamRuntimeOptions) => {
	let client: Awaited<ReturnType<typeof ensureNativeRuntime>>;
	try {
		client = await ensureRuntime(home);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? "";
		if (!["ENOENT", "ECONNREFUSED"].includes(code)) throw error;
		log.warn("supervised runtime unavailable", { reqId, runtimeMode: "supervised", code });
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
