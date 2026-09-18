import type { AgentRun } from "@trellis/api";
import type { TerminalConnectionState, TerminalTransport } from "@trellis/ui/terminal";
import { createTerminalSocket } from "../terminalSocket";
import { terminalUnavailable } from "../terminalUnavailable";

export function nativeTerminalTransport(run: Pick<AgentRun, "id" | "terminalId" | "sessionId">): TerminalTransport {
	let transport: ReturnType<typeof createTerminalSocket>;
	return {
		async follow(offset, onOutput, onState, signal) {
			let state: TerminalConnectionState = {
				connection: "connecting",
				controllable: false,
				stopped: false,
				unavailableReason: null,
			};
			onState(state);
			transport = createTerminalSocket({
				run,
				offset,
				signal,
				onOutput,
				onSession: (session) => {
					state = {
						connection: "open",
						controllable: session.controllable,
						stopped: session.status === "exited",
						unavailableReason: terminalUnavailable(session),
					};
					onState(state);
				},
			});
			await transport.done;
			if (!signal.aborted) onState({ ...state, connection: "closed", controllable: false });
		},
		send: (text, userInput) => transport.send(text, userInput),
		resize: (cols, rows) => transport.resize(cols, rows),
	};
}
