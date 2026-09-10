import {
	type AgentProjectSettings,
	type AgentSession,
	type AgentStartBuilderInput,
	type AgentStartReviewerInput,
	agentTitle,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { AgentPlace, RunnerRepo } from "../agents/runner.ts";
import { asRunnerFailure } from "../agents/runner.ts";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { parsePullRequestUrl } from "../gh/parse.ts";
import {
	type AgentsCtx,
	announce,
	clearedFailure,
	failureColumns,
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
// the same time cannot both pass the limit.
//
// A start the runner refuses writes the reason on the row it reserved and
// leaves the row in the `failed` state, which no longer counts toward the
// limit. The caller still gets the RUNNER_UNAVAILABLE error, so a CLI or a
// web caller reads the reason at once and the row keeps it afterwards.

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

// Settles the reserved row of a start that did not run, in a transaction of
// its own, so the row is settled after the caller's own call rolls back with
// the error.
//
// A refusal the runner declared stays on the row as its reason, and the next
// start of the same ticket takes that row back. Any other error is a fault
// in trellis, and trellis has no reason to show, so the row goes. A row left
// in `starting` would count toward maxConcurrent for the life of the
// project and answer every later start of its ticket.
const settleReservation = async (ctx: AgentsCtx, id: string, error: unknown) => {
	const failure = asRunnerFailure(error);
	if (failure === null) {
		await ctx.newTx((tx) => tx.execute(sql`DELETE FROM agent_sessions WHERE id = ${id}`));
		return;
	}
	await ctx.newTx((tx) =>
		tx.execute(sql`UPDATE agent_sessions SET ${failureColumns(failure)}, updated_at = ${ctx.now} WHERE id = ${id}`),
	);
};

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
		const [counted] = await rows<{ n: number }>(
			tx,
			sql`SELECT count(*)::int AS n FROM agent_sessions
				WHERE project_id = ${managed.projectId} AND role = 'builder' AND state IN ${LIVE_STATES}`,
		);
		if (counted!.n >= managed.maxConcurrent) {
			throw fail("CONCURRENCY_LIMIT", { limit: managed.maxConcurrent, running: counted!.n });
		}
		const repos = await effectiveRepos(ctx, tx, managed.projectId);
		// The builder of this ticket whose last start the runner refused. Its
		// row holds the reason until this start replaces it.
		const [refused] = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'builder' AND s.state = 'failed'`,
		);
		if (refused !== undefined) {
			await tx.execute(sql`
				UPDATE agent_sessions SET state = 'starting', ${clearedFailure}, updated_at = ${ctx.now}
				WHERE id = ${refused.id}
			`);
			return { id: refused.id, ticket, managed, repos };
		}
		const id = newSessionId();
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
		return { id, ticket, managed, repos };
	});

// A second start of a ticket whose builder is live returns that builder. A
// start the runner refuses leaves the reserved row in the `failed` state
// with the reason, and the next start of the same ticket takes that row
// back.
export const prepareBuilder = async (ctx: AgentsCtx, input: AgentStartBuilderInput): Promise<BuilderPlan> => {
	requireActor(ctx);
	const reserved = await reserveBuilder(ctx, input.ticket);
	if ("existing" in reserved) return reserved;
	try {
		const place = await ctx.runner.startBuilder({
			project: pathOf(ctx.cache, reserved.managed.projectId),
			runnerProjectId: await runnerProjectOf(ctx, reserved.managed, reserved.repos),
			baseBranch: reserved.managed.baseBranch,
			ticket: reserved.ticket.identifier,
			title: reserved.ticket.title,
		});
		return { id: reserved.id, place };
	} catch (error) {
		await settleReservation(ctx, reserved.id, error);
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

export type ReviewerPlan = { id: string; terminalId: string };

// A reviewer runs in the workspace of the ticket's newest builder that
// trellis did not stop, so it reviews the checkout the builder pushed. The
// row is reserved first, as a builder start reserves its row, so a start
// the runner refuses keeps the reason on that row.
export const prepareReviewer = async (ctx: AgentsCtx, input: AgentStartReviewerInput): Promise<ReviewerPlan> => {
	requireActor(ctx);
	if (parsePullRequestUrl(input.prUrl) === null) throw fail("INVALID_PR_URL");
	const reserved = await reserveReviewer(ctx, input.ticket, input.prUrl);
	try {
		const { terminalId } = await ctx.runner.startReviewer({
			project: reserved.project,
			ticket: reserved.identifier,
			prUrl: input.prUrl,
			workspaceId: reserved.workspaceId,
		});
		return { id: reserved.id, terminalId };
	} catch (error) {
		await settleReservation(ctx, reserved.id, error);
		throw error;
	}
};

type ReviewerReservation = { id: string; project: string; identifier: string; workspaceId: string };

const reserveReviewer = (ctx: AgentsCtx, ticketRef: string, prUrl: string) =>
	ctx.newTx(async (tx): Promise<ReviewerReservation> => {
		const ticket = await resolveTicket(ctx, tx, ticketRef);
		assertProjectActive(ctx, ticket.projectId);
		const managed = managedProject(ctx, await readAgentSettings(tx), ticket.projectId);
		const builders = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'builder' AND s.state <> 'stopped' AND s.workspace_id IS NOT NULL`,
		);
		const builder = builders.at(-1);
		if (builder === undefined) throw fail("NOT_FOUND", { kind: "builder", ref: ticket.identifier });
		// The reviewer of this ticket whose last start the runner refused. Its
		// row holds the reason until this start replaces it.
		const [refused] = await selectSessions(
			tx,
			sql`s.ticket_id = ${ticket.id} AND s.role = 'reviewer' AND s.state = 'failed'`,
		);
		const id = refused === undefined ? newSessionId() : refused.id;
		if (refused === undefined) {
			await insertSession(ctx, tx, {
				id,
				projectId: managed.projectId,
				ticketId: ticket.id,
				role: "reviewer",
				state: "starting",
				workspaceId: builder.workspaceId,
				terminalId: null,
				claudeSessionId: null,
				title: agentTitle({ role: "reviewer", ticket: ticket.identifier }),
				openUrl: builder.openUrl,
				prUrl,
			});
		} else {
			await tx.execute(sql`
				UPDATE agent_sessions SET state = 'starting', workspace_id = ${builder.workspaceId},
					open_url = ${builder.openUrl}, pr_url = ${prUrl}, ${clearedFailure}, updated_at = ${ctx.now}
				WHERE id = ${id}
			`);
		}
		return {
			id,
			project: pathOf(ctx.cache, managed.projectId),
			identifier: ticket.identifier,
			workspaceId: builder.workspaceId!,
		};
	});

export const startReviewer = async (ctx: AgentsCtx, tx: Tx, plan: ReviewerPlan): Promise<AgentSession> => {
	await tx.execute(sql`
		UPDATE agent_sessions SET terminal_id = ${plan.terminalId}, updated_at = ${ctx.now} WHERE id = ${plan.id}
	`);
	return announce(ctx, tx, plan.id);
};
