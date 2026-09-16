import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { prepareResumeRestart } from "../../src/services/restartAgents/restartAgents.ts";
import type { Harness } from "./services.ts";

type Ctx = Parameters<typeof prepareResumeRestart>[0];
export type RestartLaunch = Parameters<NonNullable<Parameters<typeof prepareResumeRestart>[2]>["start"]>[1];

// The resume context of one test home: the harness context with the home the
// plan was written to and the fixed local origin the assertions read.
export const restartResumeContext = (harness: Harness, home: string): Ctx =>
	({
		...harness.ctx(() => {}),
		core: harness.ctx(() => {}),
		newTx: harness.read,
		home,
		now: () => new Date(),
		localUrl: "http://127.0.0.1:4521",
	}) as unknown as Ctx;

// The stub execution service behind the resume: it lists the processes the
// test arranges and refuses prepared launches, which the resume tests bypass.
export const stubRestartHost = (processes: RuntimeProcessStatus[]) => () => ({
	list: async () => processes,
	status: async (id: string) => processes.find((process) => process.id === id)!,
	waitFor: async (id: string) => processes.find((process) => process.id === id)!,
	startPrepared: async () => {
		throw new Error("Unexpected prepared launch.");
	},
});

// Records one native launch and reports the running process the resume
// expects, with the receipt the new process acknowledges.
export const recordRestartLaunch = (
	processes: RuntimeProcessStatus[],
	launches: RestartLaunch[],
	input: RestartLaunch,
) => {
	launches.push(input);
	processes.push({
		id: input.attempt.id,
		status: "running",
		controllable: true,
		agent: { sessionId: input.run.sessionId },
		acknowledgedMessageIds: [input.attempt.id],
	} as RuntimeProcessStatus);
	return { id: input.run.id };
};
