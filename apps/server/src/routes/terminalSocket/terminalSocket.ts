import { upgradeWebSocket } from "hono/bun";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import type { Config } from "../../config.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import { invalidInput } from "../../errors.ts";
import { terminalConnection } from "./terminalConnection.ts";

export const terminalSocketRoute = (config: Config, transport: ServiceTransport) =>
	upgradeWebSocket(async (c) => {
		const origin = c.req.header("origin");
		if (origin !== undefined && origin !== new URL(c.req.url).origin)
			throw invalidInput("origin", "Use the Trellis page to connect to its terminal.");
		const attemptId = c.req.query("attemptId");
		if (!attemptId || !/^[a-zA-Z0-9_-]{1,128}$/.test(attemptId))
			throw invalidInput("attemptId", "Use the terminal attempt identifier.");
		const rawOffset = c.req.query("offset") ?? "0";
		const offset = Number(rawOffset);
		if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset))
			throw invalidInput("offset", "Use a non-negative byte offset.");
		const target = (await transport.call(
			"agentRuns.terminalTarget",
			{
				actor: null,
				session: null,
				reqId: c.get("requestId"),
				now: new Date(),
			},
			{
				id: c.req.param("id"),
				expectedTerminalId: attemptId,
				expectedSessionId: c.req.query("sessionId"),
			},
		)) as { terminalId: string; sessionId: string | null };
		return terminalConnection(await ensureNativeRuntime(config.home), target.terminalId, offset);
	});
