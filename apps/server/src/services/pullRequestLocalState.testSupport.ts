import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { iso } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import { openTestDb } from "../db/testDb.ts";
import type { Tx } from "../db/tx.ts";
import type { PullRequestRow } from "../gh/graphql.ts";
import { upsertPullRequests } from "../gh/pollerWrite.ts";
import { candidates } from "./needsYou/candidates.ts";
import { setLocalState } from "./pullRequestLocalState.ts";
import { link } from "./pullRequests.ts";
import type { IoCtx } from "./support.ts";

export const openPullRequestLocalStateTest = async () => {
	const db = await openTestDb();
	const events: { type: string }[] = [];
	const root = ulid();
	const status = ulid();
	const at = new Date("2026-09-22T10:00:00.000Z");
	const later = new Date("2026-09-22T16:00:00.000Z");
	const agent: ActorRef = { kind: "agent", name: "claude-code" };
	const person: ActorRef = { kind: "human", name: "dana" };
	let ticketNumber = 0;

	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'LOC', 'loc', 'Local', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${root}, 'In Progress', 'in-progress', 'started', 'accent', 0, true, ${at}, ${at})`);

	const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

	const ctxOf = (actor: ActorRef, now: Date = at) =>
		({
			actor,
			core: { actor, now, actorCache: new Map() } as IoCtx["core"],
			now: () => now,
			emit: (event: { type: string }) => {
				events.push(event);
			},
		}) as unknown as IoCtx;

	const newTicket = async (title: string) => {
		ticketNumber += 1;
		const id = ulid();
		await db.execute(sql`INSERT INTO tickets
			(id, project_id, number, title, status_id, position, created_at, updated_at)
			VALUES (${id}, ${root}, ${ticketNumber}, ${title}, ${status}, ${ticketNumber}, ${at}, ${at})`);
		return { id, identifier: `LOC-${ticketNumber}` };
	};

	const linkAs = (actor: ActorRef, ticket: string, number: number) =>
		run((tx) =>
			link(ctxOf(actor), tx, {
				ticket,
				url: `https://github.com/acme/app/pull/${number}`,
				ref: { owner: "acme", repo: "app", number },
				fetched: { error: "gh is away" },
			}),
		);

	const writeParts = async (id: string, headSha: string) => {
		await db.execute(sql`UPDATE pull_requests SET head_sha = ${headSha}, ci_state = 'pass' WHERE id = ${id}`);
		await db.execute(sql`INSERT INTO pr_summaries (pull_request_id, head_sha, headline, why, watch, created_at, updated_at)
			VALUES (${id}, ${headSha}, 'It adds the rule.', 'The glyph lied.', 'nothing', ${at}, ${at})`);
		await db.execute(sql`INSERT INTO pr_evidence_documents
			(pull_request_id, head_sha, body, actor_name, actor_kind, created_at, updated_at)
			VALUES (${id}, ${headSha}, 'Proof.', 'claude-code', 'agent', ${at}, ${at})`);
	};

	const readyPullRequest = async (title: string, number: number) => {
		const ticket = await newTicket(title);
		const linked = await linkAs(agent, ticket.identifier, number);
		await writeParts(linked.id, `head${number}`);
		await run((tx) => setLocalState(ctxOf(agent), tx, { id: linked.id, localState: "ready" }));
		return { ticket, id: linked.id };
	};

	const gapsOf = async (ticketId: string) => {
		const [ticket] = await run((tx) => ticketSummaries(tx, [ticketId]));
		return ticket!.prRows[0]!.reviewGaps.map((gap) => gap.kind);
	};

	const inboxOf = async () => (await run((tx) => candidates(tx, "dana"))).map((item) => item.identifier);

	const activityOf = async (id: string) => {
		const found = await db.execute(
			sql`SELECT action, actor_name, actor_kind FROM activity
				WHERE action LIKE 'pr.%ready_for_review' AND meta->>'pullRequestId' = ${id} ORDER BY id`,
		);
		return (found.rows as { action: string; actor_name: string; actor_kind: string }[]).map((row) => [
			row.action,
			row.actor_kind,
			row.actor_name,
		]);
	};

	const readyAtOf = async (id: string) => {
		const found = await db.execute(
			sql`SELECT ${iso(sql`ready_for_review_at`)} AS at FROM pull_requests WHERE id = ${id}`,
		);
		return (found.rows[0] as { at: string | null }).at;
	};

	const fetched = (number: number, headSha: string, state: "open" | "merged"): PullRequestRow => ({
		owner: "acme",
		repo: "app",
		number,
		additions: 1,
		deletions: 1,
		changedFiles: 1,
		files: [],
		url: `https://github.com/acme/app/pull/${number}`,
		title: "Add the rule",
		state,
		isDraft: false,
		isQueued: false,
		queuePosition: null,
		headSha,
		headRef: "fix",
		baseRef: "main",
		mergeable: "mergeable",
		reviewState: "none",
		mergedAt: state === "merged" ? later.toISOString() : null,
		closedAt: null,
		checks: [],
		ciState: "none",
		contentHash: ulid(),
	});

	const poll = (number: number, headSha: string, state: "open" | "merged" = "open") =>
		run((tx) => upsertPullRequests(tx, later, [fetched(number, headSha, state)]));

	return {
		db,
		events,
		root,
		at,
		later,
		agent,
		person,
		run,
		ctxOf,
		newTicket,
		linkAs,
		writeParts,
		readyPullRequest,
		gapsOf,
		inboxOf,
		activityOf,
		readyAtOf,
		poll,
		close: () => db.$client.close(),
	};
};
