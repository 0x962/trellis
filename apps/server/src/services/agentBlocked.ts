import type { AgentSession, AgentUnblockInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type ManagerPlan, prepareManager, recordManager } from "./agentManager.ts";
import { type AgentsCtx, announce, sessionById, toSession } from "./agentSessions.ts";
import { type BuilderPlan, prepareBuilder, startBuilder } from "./agentStart.ts";
import { addTrustedFolder } from "./projectsTrustedFolders.ts";

// The one action a blocked agent offers a person. It adds the folder the
// session recorded to the trusted folders of the project, stops the agent
// that waits, and starts it again. The next start seeds the trust, so the
// agent runs instead of asking.
//
// A reviewer is stopped and not started again: trellis keeps no pull
// request URL on the session, and the manager starts the next reviewer.
// The workspace stays in every case, because the new agent works the
// checkout the old one had.

export type UnblockPlan =
	| { kind: "builder"; builder: BuilderPlan }
	| { kind: "manager"; manager: ManagerPlan }
	| { kind: "reviewer"; id: string };

export const prepareUnblock = async (ctx: AgentsCtx, input: AgentUnblockInput): Promise<UnblockPlan> => {
	requireActor(ctx);
	const session = await ctx.newTx((tx) => sessionById(tx, input.id));
	if (session.blocked === null) throw fail("NOT_FOUND", { kind: "blockedAgent", ref: input.id });
	const { path } = session.blocked;
	if (path !== null) await ctx.newTx((tx) => addTrustedFolder(ctx, tx, session.projectId, path));

	// The stop commits before the start, so the start sees no live agent on
	// the ticket and makes a new one.
	if (session.workspaceId !== null && session.terminalId !== null) {
		await ctx.runner.stop({ workspaceId: session.workspaceId, terminalId: session.terminalId });
	}
	await ctx.newTx(async (tx) => {
		await tx.execute(
			sql`UPDATE agent_sessions SET state = 'stopped', updated_at = ${ctx.now} WHERE id = ${session.id}`,
		);
		await announce(ctx, tx, session.id);
	});

	if (session.role === "reviewer") return { kind: "reviewer", id: session.id };
	if (session.role === "manager") {
		return { kind: "manager", manager: await prepareManager(ctx, { project: session.projectId }) };
	}
	// A ticket ref may be the ticket's own id, so the builder start needs
	// no second read to name the ticket.
	return { kind: "builder", builder: await prepareBuilder(ctx, { ticket: session.ticketId! }) };
};

export const unblock = async (ctx: AgentsCtx, tx: Tx, plan: UnblockPlan): Promise<AgentSession> => {
	if (plan.kind === "builder") return startBuilder(ctx, tx, plan.builder);
	if (plan.kind === "manager") return recordManager(ctx, tx, plan.manager);
	return toSession(await sessionById(tx, plan.id));
};
