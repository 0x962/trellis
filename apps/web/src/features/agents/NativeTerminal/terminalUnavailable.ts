import type { TerminalProcess } from "./terminalStream";

export function terminalUnavailable(session: Pick<TerminalProcess, "status" | "controllable" | "error"> | null) {
	if (!session || session.status === "exited" || session.controllable) return null;
	return `Terminal input is unavailable. ${session.error ?? "The runtime cannot control this process."}`;
}
