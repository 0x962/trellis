import {
	type AgentProjectSettings,
	type AgentSession,
	type AgentStartBuilderInput,
	type AgentStartReviewerInput,
	agentTitle,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { type AgentPlace, isStartFailure, type RunnerRepo } from "../agents/runner.ts";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { parsePullRequestUrl } from "../gh/parse.ts";
import {
	type AgentsCtx,
	announce,
	failSession,
	insertSession,
	LIVE_STATES,
	newSessionId,
	selectSessions,
	toSession,
} from "./agentSessions.ts";
import { managedProject, readAgentSettings } from "./agentSettings.ts";
import { assertProjectActive, chainOf, pathOf, resolveTicket, type TicketRow } from "./refs.ts";

// A builder start runs in three steps. The first transaction checks the
// ticket, the switches, and the limit, and inserts the session as
// `starting`. The runner then makes the workspace, with no transaction
// open. The last transaction records where the builder runs. The inserted
// row counts toward the limit while the runner works, so two starts at
// the same time cannot both pass the limit. A runner failure marks the row
// `failed` with the runner's message, and the next start of the ticket
// writes to that row.

// The repositories a project and its ancestors declare, nearest first.
export const effectiveRepos = async (ctx: ServiceCtx, tx: Tx, projectId: string): Promise<RunnerRepo[]> => {
	const chain = chainOf(ctx.cache, projectId).map((project) => project.id);
	const found = await rows<{ project_id: string; owner: string; repo: string }>(
		tx,
		sql`SELECT project_id, owner, repo FROM repos WHERE project_id = ANY(${textArray(chain)}) ORDER BY owner, repo`,
	);
	return chain.flatMap((id) =>
		found.filter((row) => row.project_id === id).map(({ owner, repo }) => ({ owner, repo })),
	);
};

// The Superset project the settings name, or else the one that holds a
// declared repo.
export const runnerProjectOf = (ctx: AgentsCtx, managed: AgentProjectSettings, repos: RunnerRepo[]) =>
	managed.supersetProjectId === null ? ctx.runner.projectFor(repos) : Promise.resolve(managed.supersetProjectId);

// The branch the settings name, or else the default branch of the runner
// project's checkout.
export const baseBranchOf = (ctx: AgentsCtx, managed: AgentProjectSettings, runnerProjectId: string) =>
	managed.baseBranch === null ? ctx.runner.defaultBranch(runnerProjectId) : Promise.resolve(managed.baseBranch);

type Reservation = { id: string; ticket: TicketRow; managed: AgentProjectSettings; repos: RunnerRepo[] };

export type BuilderPlan = { existing: AgentSession } | { id: string; place: AgentPlace };

const reserveBuilder = (ctx: AgentsCtx, ticketRef: string) =>
	ctx.newTx(async (tx): Promise<Reservation | { existing: AgentSession }> => {
		const ticket = await resolveTicket(ctx, tx, ticketRef);
		assertProjectActive(ctx, ticket.projectId);
		const managed = managedProject(ctx, await readAgentSettings(tx), ticket.projectId);
		const [existing] = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'builder' AND s.state IN ${LIVE_STATES}`,
		);
		if (existing !== undefined) return { existing: toSession(existing) };
		// One ticket counts once, however many live rows it has.
		const [counted] = await rows<{ n: number }>(
			tx,
			sql`SELECT count(DISTINCT ticket_id)::int AS n FROM agent_sessions
				WHERE project_id = ${managed.projectId} AND role = 'builder' AND state IN ${LIVE_STATES}`,
		);
		if (counted!.n >= managed.maxConcurrent) {
			throw fail("CONCURRENCY_LIMIT", { limit: managed.maxConcurrent, running: counted!.n });
		}
		const [failed] = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'builder' AND s.state = 'failed' AND s.workspace_id IS NULL`,
		);
		const id = failed === undefined ? newSessionId() : failed.id;
		if (failed === undefined) {
			await insertSession(ctx, tx, {
				id,
				projectId: managed.projectId,
				ticketId: ticket.id,
				role: "builder",
				state: "starting",
				workspaceId: null,
				terminalId: null,
				claudeSessionId: null,
				title: ticket.identifier,
				openUrl: null,
			});
		} else {
			await tx.execute(
				sql`UPDATE agent_sessions SET state = 'starting', error = NULL, updated_at = ${ctx.now} WHERE id = ${id}`,
			);
		}
		return { id, ticket, managed, repos: await effectiveRepos(ctx, tx, managed.projectId) };
	});

// A second start of a ticket whose builder is live returns that builder.
// When the runner refuses the start, the reserved row becomes `failed`, so
// it no longer counts toward the limit, and the ticket shows the runner's
// error. Any other failure takes the reserved row away.
export const prepareBuilder = async (ctx: AgentsCtx, input: AgentStartBuilderInput): Promise<BuilderPlan> => {
	requireActor(ctx);
	const reserved = await reserveBuilder(ctx, input.ticket);
	if ("existing" in reserved) return reserved;
	try {
		const runnerProjectId = await runnerProjectOf(ctx, reserved.managed, reserved.repos);
		const place = await ctx.runner.startBuilder({
			project: pathOf(ctx.cache, reserved.managed.projectId),
			runnerProjectId,
			baseBranch: await baseBranchOf(ctx, reserved.managed, runnerProjectId),
			ticket: reserved.ticket.identifier,
			title: reserved.ticket.title,
		});
		return { id: reserved.id, place };
	} catch (error) {
		await ctx.newTx(async (tx) => {
			if (isStartFailure(error)) await failSession(ctx, tx, reserved.id, error.message);
			else await tx.execute(sql`DELETE FROM agent_sessions WHERE id = ${reserved.id}`);
		});
		throw error;
	}
};

export const startBuilder = async (ctx: AgentsCtx, tx: Tx, plan: BuilderPlan): Promise<AgentSession> => {
	if ("existing" in plan) return plan.existing;
	await tx.execute(sql`
		UPDATE agent_sessions SET workspace_id = ${plan.place.workspaceId}, terminal_id = ${plan.place.terminalId},
			open_url = ${plan.place.openUrl}, updated_at = ${ctx.now}
		WHERE id = ${plan.id}
	`);
	return announce(ctx, tx, plan.id);
};

export type ReviewerPlan = {
	projectId: string;
	ticketId: string;
	title: string;
	workspaceId: string;
	terminalId: string;
	openUrl: string | null;
};

// A reviewer runs in the workspace of the ticket's newest builder that
// trellis did not stop, so it reviews the checkout the builder pushed.
export const prepareReviewer = async (ctx: AgentsCtx, input: AgentStartReviewerInput): Promise<ReviewerPlan> => {
	requireActor(ctx);
	if (parsePullRequestUrl(input.prUrl) === null) throw fail("INVALID_PR_URL");
	const found = await ctx.newTx(async (tx) => {
		const ticket = await resolveTicket(ctx, tx, input.ticket);
		assertProjectActive(ctx, ticket.projectId);
		const managed = managedProject(ctx, await readAgentSettings(tx), ticket.projectId);
		const builders = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'builder' AND s.state <> 'stopped' AND s.workspace_id IS NOT NULL`,
		);
		const builder = builders.at(-1);
		if (builder === undefined) throw fail("NOT_FOUND", { kind: "builder", ref: ticket.identifier });
		return { ticket, managed, workspaceId: builder.workspaceId!, openUrl: builder.openUrl };
	});
	const row = {
		projectId: found.managed.projectId,
		ticketId: found.ticket.id,
		title: agentTitle({ role: "reviewer", ticket: found.ticket.identifier }),
		workspaceId: found.workspaceId,
		openUrl: found.openUrl,
	};
	try {
		const { terminalId } = await ctx.runner.startReviewer({
			project: pathOf(ctx.cache, found.managed.projectId),
			ticket: found.ticket.identifier,
			prUrl: input.prUrl,
			workspaceId: found.workspaceId,
		});
		return { ...row, terminalId };
	} catch (error) {
		if (isStartFailure(error)) await ctx.newTx((tx) => recordFailedReviewer(ctx, tx, row, error.message));
		throw error;
	}
};

// A reviewer the runner could not start holds no terminal.
const recordFailedReviewer = async (ctx: AgentsCtx, tx: Tx, row: Omit<ReviewerPlan, "terminalId">, error: string) => {
	const id = newSessionId();
	await insertSession(ctx, tx, {
		id,
		role: "reviewer",
		state: "failed",
		terminalId: null,
		claudeSessionId: null,
		error,
		...row,
	});
	return announce(ctx, tx, id);
};

export const startReviewer = async (ctx: AgentsCtx, tx: Tx, plan: ReviewerPlan): Promise<AgentSession> => {
	const id = newSessionId();
	await insertSession(ctx, tx, { id, role: "reviewer", state: "starting", claudeSessionId: null, ...plan });
	return announce(ctx, tx, id);
};
