import { upgradeWebSocket } from "hono/bun";
import { browserSessionFromContext } from "../../auth/index.ts";
import type { Config } from "../../config.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import { invalidInput } from "../../errors.ts";
import type { Logger } from "../../log.ts";
import type { BrowserSessionStore } from "../../services/browserSessions/index.ts";
import { prepareTerminalSocket } from "./prepareTerminalSocket/index.ts";

export type TerminalSocketOptions = {
	origin: string | null;
	sessions: BrowserSessionStore | null;
	log: Logger;
};

export const isTerminalOriginAllowed = (
	requestOrigin: string | undefined,
	requestUrl: string,
	browserOrigin: string | null,
) => requestOrigin === undefined || requestOrigin === (browserOrigin ?? new URL(requestUrl).origin);

export const terminalSocketRoute = (
	config: Config,
	transport: ServiceTransport,
	options: TerminalSocketOptions,
) =>
	upgradeWebSocket(async (c) => {
		const origin = c.req.header("origin");
		if (!isTerminalOriginAllowed(origin, c.req.url, options.origin))
			throw invalidInput("origin", "Use the Trellis page to connect to its terminal.");
		const browserSession = browserSessionFromContext(c);
		const attemptId = c.req.query("attemptId");
		if (!attemptId || !/^[a-zA-Z0-9_-]{1,128}$/.test(attemptId))
			throw invalidInput("attemptId", "Use the terminal attempt identifier.");
		const rawOffset = c.req.query("offset") ?? "0";
		const offset = Number(rawOffset);
		if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset))
			throw invalidInput("offset", "Use a non-negative byte offset.");
		return prepareTerminalSocket({
			home: config.home,
			transport,
			runId: c.req.param("id"),
			attemptId,
			expectedSessionId: c.req.query("sessionId"),
			offset,
			acknowledge: c.req.query("ack") === "1",
			reqId: c.get("requestId"),
			browserSession:
				browserSession === null ? null : { session: browserSession, sessions: options.sessions! },
			log: options.log,
		});
	});
