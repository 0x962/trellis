import type { AgentRetryInput, AgentSession } from "@trellis/api";
import { requireActor } from "../context.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { type ManagerPlan, prepareManager, recordManager } from "./agentManager.ts";
import { type AgentsCtx, sessionById } from "./agentSessions.ts";
import {
	type BuilderPlan,
	prepareBuilder,
	prepareReviewer,
	type ReviewerPlan,
	startBuilder,
	startReviewer,
} from "./agentStart.ts";
import { pathOf } from "./refs.ts";

// `agents.retry` runs the start of a failed session again. It calls the
// same prepare step the first start called, so a second refusal writes the
// new reason on the same row and answers with it. Only a session in the
// `failed` state has a start to run again: every other state either holds a
// terminal or is history a person chose.

export type RetryPlan =
	| { role: "manager"; plan: ManagerPlan }
	| { role: "builder"; plan: BuilderPlan }
	| { role: "reviewer"; plan: ReviewerPlan };

export const prepareRetry = async (ctx: AgentsCtx, input: AgentRetryInput): Promise<RetryPlan> => {
	requireActor(ctx);
	const session = await ctx.newTx((tx) => sessionById(tx, input.id));
	if (session.state !== "failed") throw fail("NOT_FOUND", { kind: "failedAgent", ref: input.id });
	if (session.role === "manager") {
		return { role: "manager", plan: await prepareManager(ctx, { project: pathOf(ctx.cache, session.projectId) }) };
	}
	// resolveTicket takes the ticket id as well as an identifier such as
	// "CDE-42", so the start services take the id the row already holds.
	const ticket = session.ticketId!;
	if (session.role === "builder") return { role: "builder", plan: await prepareBuilder(ctx, { ticket }) };
	return { role: "reviewer", plan: await prepareReviewer(ctx, { ticket, prUrl: session.prUrl! }) };
};

export const retry = (ctx: AgentsCtx, tx: Tx, plan: RetryPlan): Promise<AgentSession> => {
	if (plan.role === "manager") return recordManager(ctx, tx, plan.plan);
	if (plan.role === "builder") return startBuilder(ctx, tx, plan.plan);
	return startReviewer(ctx, tx, plan.plan);
};
