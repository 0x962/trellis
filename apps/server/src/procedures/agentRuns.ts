import { call, os } from "./base.ts";
export const agentRuns = os.agentRuns.router({
	session: os.agentRuns.session.handler(({ context, input }) => call(context, "agentRuns.session", input)),
	terminalOutput: os.agentRuns.terminalOutput.handler(({ context, input }) =>
		call(context, "agentRuns.terminalOutput", input),
	),
	terminalInput: os.agentRuns.terminalInput.handler(({ context, input }) =>
		call(context, "agentRuns.terminalInput", input),
	),
	resize: os.agentRuns.resize.handler(({ context, input }) => call(context, "agentRuns.resize", input)),
	send: os.agentRuns.send.handler(({ context, input }) => call(context, "agentRuns.send", input)),
	output: os.agentRuns.output.handler(({ context, input }) => call(context, "agentRuns.output", input)),
	list: os.agentRuns.list.handler(({ context, input }) => call(context, "agentRuns.list", input)),
	start: os.agentRuns.start.handler(({ context, input }) => call(context, "agentRuns.start", input)),
	stop: os.agentRuns.stop.handler(({ context, input }) => call(context, "agentRuns.stop", input)),
	refresh: os.agentRuns.refresh.handler(({ context, input }) => call(context, "agentRuns.refresh", input)),
});
