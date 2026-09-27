import { upgradeWebSocket } from "hono/bun";
import { browserSessionForRequest } from "../../auth/index.ts";
import type { Config } from "../../config.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import { invalidInput } from "../../errors.ts";
import type { BrowserSessionStore } from "../../services/browserSessions/index.ts";
import { terminalStreamRuntime } from "../terminalRuntime.ts";
import { browserSessionTerminalEvents } from "./browserSessionTerminalEvents/index.ts";
import { terminalConnection } from "./terminalConnection.ts";

export type TerminalSocketBrowserAccess = {
	origin: string | null;
	sessions: BrowserSessionStore | null;
};

export const terminalOriginAccepted = (
	requestOrigin: string | undefined,
	requestUrl: string,
	browserOrigin: string | null,
) => requestOrigin === undefined || requestOrigin === (browserOrigin ?? new URL(requestUrl).origin);

export const terminalSocketRoute = (
	config: Config,
	transport: ServiceTransport,
	browserAccess: TerminalSocketBrowserAccess,
) =>
	upgradeWebSocket(async (c) => {
		const origin = c.req.header("origin");
		if (!terminalOriginAccepted(origin, c.req.url, browserAccess.origin))
			throw invalidInput("origin", "Use the Trellis page to connect to its terminal.");
		const browserSession = browserSessionForRequest(c.req.raw);
		const attemptId = c.req.query("attemptId");
		if (!attemptId || !/^[a-zA-Z0-9_-]{1,128}$/.test(attemptId))
			throw invalidInput("attemptId", "Use the terminal attempt identifier.");
		const rawOffset = c.req.query("offset") ?? "0";
		const offset = Number(rawOffset);
		if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset))
			throw invalidInput("offset", "Use a non-negative byte offset.");
		const setup = async () => {
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
			const client = await terminalStreamRuntime(config.home);
			const binaryChannel = (await client.hello()).capabilities?.includes("terminal-channel") === true;
			return terminalConnection(client, target.terminalId, offset, binaryChannel, c.req.query("ack") === "1");
		};
		if (browserSession === null) return setup();
		return browserSessionTerminalEvents({ session: browserSession, sessions: browserAccess.sessions!, setup });
	});
