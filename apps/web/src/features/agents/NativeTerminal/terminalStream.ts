import type { AgentRun, TrellisClient } from "@trellis/api";
import type { TerminalFrame } from "@trellis/ui/terminal";

export type TerminalProcess = NonNullable<Awaited<ReturnType<TrellisClient["agentRuns"]["session"]>>>;

export async function consumeTerminalStream(
	response: Response,
	onOutput: (frame: TerminalFrame) => Promise<void>,
	onSession: (session: TerminalProcess) => void,
) {
	if (!response.ok) throw new Error(`The terminal request failed (${response.status}): ${await response.text()}`);
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let pending = "";
	let exited = false;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			pending += decoder.decode(value, { stream: true });
			let end = pending.indexOf("\n\n");
			while (end !== -1) {
				const lines = pending.slice(0, end).split("\n");
				pending = pending.slice(end + 2);
				const event = lines
					.find((line) => line.startsWith("event:"))
					?.slice(6)
					.trim();
				const data = lines
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trim())
					.join("\n");
				if (event === "output") await onOutput(JSON.parse(data) as TerminalFrame);
				if (event === "session") {
					const { session } = JSON.parse(data) as { session: TerminalProcess };
					exited = session.status === "exited";
					onSession(session);
				}
				if (event === "error") throw new Error((JSON.parse(data) as { message: string }).message);
				end = pending.indexOf("\n\n");
			}
		}
		if (!exited) throw new Error("The terminal stream closed before the process exited.");
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
}

export async function followTerminal(
	run: Pick<AgentRun, "id" | "terminalId" | "sessionId">,
	offset: number,
	signal: AbortSignal,
	onOutput: (frame: TerminalFrame) => Promise<void>,
	onSession: (session: TerminalProcess) => void,
) {
	const params = new URLSearchParams({ attemptId: run.terminalId!, offset: String(offset) });
	if (run.sessionId) params.set("sessionId", run.sessionId);
	const response = await fetch(`/api/agent-runs/${run.id}/terminal/stream?${params}`, { signal });
	await consumeTerminalStream(response, onOutput, onSession);
}
