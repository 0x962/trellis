import type { WSEvents } from "hono/ws";
import type { ServiceTransport } from "../../../db/transport.ts";
import type { Logger } from "../../../log.ts";
import type { BrowserSession, BrowserSessionStore } from "../../../services/browserSessions/index.ts";
import { terminalStreamRuntime } from "../../terminalRuntime.ts";
import { browserSessionTerminalEvents } from "../browserSessionTerminalEvents/index.ts";
import { terminalConnection } from "../terminalConnection.ts";

export type TerminalBrowserSession = {
	session: BrowserSession;
	sessions: Pick<BrowserSessionStore, "onInvalidated">;
};

export type PrepareTerminalSocketInput = {
	home: string;
	transport: ServiceTransport;
	runId: string;
	attemptId: string;
	expectedSessionId: string | undefined;
	offset: number;
	acknowledge: boolean;
	reqId: string;
	browserSession: TerminalBrowserSession | null;
	log: Logger;
};

export const prepareTerminalSocket = async ({
	home,
	transport,
	runId,
	attemptId,
	expectedSessionId,
	offset,
	acknowledge,
	reqId,
	browserSession,
	log,
}: PrepareTerminalSocketInput): Promise<WSEvents> => {
	const target = (await transport.call(
		"agentRuns.terminalTarget",
		{
			actor: null,
			session: null,
			reqId,
			now: new Date(),
		},
		{
			id: runId,
			expectedTerminalId: attemptId,
			expectedSessionId,
		},
	)) as { terminalId: string; sessionId: string | null };
	const setup = async () => {
		const client = await terminalStreamRuntime(home);
		const binaryChannel = (await client.hello()).capabilities?.includes("terminal-channel") === true;
		return terminalConnection(client, target.terminalId, offset, binaryChannel, acknowledge);
	};
	if (browserSession === null) return setup();
	return browserSessionTerminalEvents({
		session: browserSession.session,
		sessions: browserSession.sessions,
		log,
		reqId,
		runId,
		attemptId,
		setup,
	});
};
