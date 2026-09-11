import type { AgentRunnerHostsOutput } from "@trellis/api";
import type { Tx } from "../db/tx.ts";
import type { AgentsCtx } from "./agentSessions.ts";

// The runner call runs before the transaction opens, so the database stays
// free while superset runs, as `agents.runnerProjects` does.
export const prepareRunnerHosts = async (ctx: AgentsCtx): Promise<AgentRunnerHostsOutput> => ({
	hosts: (await ctx.runner.hosts()).filter((host) => host.online).map(({ id, name }) => ({ id, name })),
});

// The picker offers the machines an agent can reach now, so an offline host
// is not on the list. A project that already names an offline host keeps
// the setting; its next agent start fails with the reason `host`.
export const runnerHosts = async (
	_ctx: AgentsCtx,
	_tx: Tx,
	prepared: AgentRunnerHostsOutput,
): Promise<AgentRunnerHostsOutput> => prepared;
