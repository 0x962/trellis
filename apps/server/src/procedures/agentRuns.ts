import { call, os } from "./base.ts";
export const agentRuns = os.agentRuns.router({
	broadcastRecipients: os.agentRuns.broadcastRecipients.handler(({ context, input }) =>
		call(context, "agentRuns.broadcastRecipients", input),
	),
	broadcast: os.agentRuns.broadcast.handler(({ context, input }) => call(context, "agentRuns.broadcast", input)),
	switchAccount: os.agentRuns.switchAccount.handler(({ context, input }) =>
		call(context, "agentRuns.switchAccount", input),
	),
	activity: os.agentRuns.activity.handler(({ context, input }) => call(context, "agentRuns.activity", input)),
	seen: os.agentRuns.seen.handler(({ context, input }) => call(context, "agentRuns.seen", input)),
	answer: os.agentRuns.answer.handler(({ context, input }) => call(context, "agentRuns.answer", input)),
	workspaceLineStats: os.agentRuns.workspaceLineStats.handler(({ context, input }) =>
		call(context, "agentRuns.workspaceLineStats", input),
	),
	workspaceSummary: os.agentRuns.workspaceSummary.handler(({ context, input }) =>
		call(context, "agentRuns.workspaceSummary", input),
	),
	workspace: os.agentRuns.workspace.handler(({ context, input }) => call(context, "agentRuns.workspace", input)),
	file: os.agentRuns.file.handler(({ context, input }) => call(context, "agentRuns.file", input)),
	setModel: os.agentRuns.setModel.handler(({ context, input }) => call(context, "agentRuns.setModel", input)),
	resume: os.agentRuns.resume.handler(({ context, input }) => call(context, "agentRuns.resume", input)),
	retry: os.agentRuns.retry.handler(({ context, input }) => call(context, "agentRuns.retry", input)),
	session: os.agentRuns.session.handler(({ context, input }) => call(context, "agentRuns.session", input)),
	terminalOutput: os.agentRuns.terminalOutput.handler(({ context, input }) =>
		call(context, "agentRuns.terminalOutput", input),
	),
	terminalInput: os.agentRuns.terminalInput.handler(({ context, input }) =>
		call(context, "agentRuns.terminalInput", input),
	),
	interrupt: os.agentRuns.interrupt.handler(({ context, input }) => call(context, "agentRuns.interrupt", input)),
	resize: os.agentRuns.resize.handler(({ context, input }) => call(context, "agentRuns.resize", input)),
	send: os.agentRuns.send.handler(({ context, input }) => call(context, "agentRuns.send", input)),
	output: os.agentRuns.output.handler(({ context, input }) => call(context, "agentRuns.output", input)),
	list: os.agentRuns.list.handler(({ context, input }) => call(context, "agentRuns.list", input)),
	setPinned: os.agentRuns.setPinned.handler(({ context, input }) => call(context, "agentRuns.setPinned", input)),
	ticketMetrics: os.agentRuns.ticketMetrics.handler(({ context, input }) =>
		call(context, "agentRuns.ticketMetrics", input),
	),
	start: os.agentRuns.start.handler(({ context, input }) => call(context, "agentRuns.start", input)),
	stop: os.agentRuns.stop.handler(({ context, input }) => call(context, "agentRuns.stop", input)),
	pause: os.agentRuns.pause.handler(({ context, input }) => call(context, "agentRuns.pause", input)),
	refresh: os.agentRuns.refresh.handler(({ context, input }) => call(context, "agentRuns.refresh", input)),
});
