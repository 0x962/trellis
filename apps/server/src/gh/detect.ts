import type { CiState, PrState } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { SYSTEM_ACTOR } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import { type Emit, type Tx, withTx } from "../db/tx.ts";
import { fetchPullRequests, type PullRequestRef } from "./graphql.ts";
import { findTicketIdentifiers, parsePullRequestUrl } from "./parse.ts";
import type { PollerHook } from "./poller.ts";
import { linkedTickets, storeFetchErrors, touchSystemActor, upsertPullRequests } from "./pollerWrite.ts";
import type { GhRunner } from "./run.ts";

// Auto-link reads the open pull requests of every declared repository and
// links each one to the tickets its text names. The key is uppercased before
// it resolves, so the branch form `cde-2-foo` finds the ticket CDE-2.
//
// The listed url names the repository a pull request lives in. A ticket
// links only when its own root project tree declares that repository, so two
// projects with the same key stay apart.

const LIST_ARGS = ["--state", "open", "--limit", "100", "--json", "number,url,title,headRefName,body"];

type RepoPair = { owner: string; repo: string };

export type ListedPullRequest = { number: number; url: string; title: string; headRefName: string; body: string };

type TicketRow = { id: string; root_id: string; project_id: string };

type StoredPr = { id: string; state: PrState; ci_state: CiState };

// A pull request this run linked for the first time, and the ref that reads
// its fields from gh.
type FreshPr = { id: string; ref: PullRequestRef };

const declaredRepos = (tx: Tx) => rows<RepoPair>(tx, sql`SELECT DISTINCT owner, repo FROM repos ORDER BY owner, repo`);

const listOpen = async (gh: GhRunner, pair: RepoPair): Promise<ListedPullRequest[] | null> => {
	const result = await gh("poller", ["pr", "list", "--repo", `${pair.owner}/${pair.repo}`, ...LIST_ARGS]);
	if (!result.ok) return null;
	return JSON.parse(result.stdout) as ListedPullRequest[];
};

// The ticket the identifier names, when the ticket's root project tree
// declares the repository the pull request lives in. Any other ticket with
// that key and number belongs to another tree, so it is left alone.
const findTicket = async (tx: Tx, ref: PullRequestRef, key: string, number: number) => {
	const [row] = await rows<TicketRow>(
		tx,
		sql`
			SELECT t.id, t.root_id, t.project_id
			FROM tickets t JOIN projects root ON root.id = t.root_id
			WHERE root.key = ${key} AND t.number = ${number}
				AND EXISTS (
					SELECT 1 FROM repos r JOIN projects p ON p.id = r.project_id
					WHERE p.root_id = t.root_id AND r.owner = ${ref.owner} AND r.repo = ${ref.repo}
				)
		`,
	);
	return row;
};

// Every ticket the pull request text names, in text order. The regex reads
// the title, the head branch, and the body.
const matchTickets = async (tx: Tx, ref: PullRequestRef, listed: ListedPullRequest) => {
	const text = `${listed.title}\n${listed.headRefName}\n${listed.body}`;
	const tickets: TicketRow[] = [];
	for (const found of findTicketIdentifiers(text)) {
		const ticket = await findTicket(tx, ref, found.key, found.number);
		if (ticket !== undefined) tickets.push(ticket);
	}
	return tickets;
};

type AnnounceInput = { at: Date; pr: StoredPr; url: string; linked: TicketRow[] };

// One timeline row per newly linked ticket, and one event for the clients
// that watch them. The ticket version stays, because the link adds a row the
// client reads through the ticket page.
const announce = async (tx: Tx, emit: Emit, input: AnnounceInput) => {
	const batchId = ulid();
	const meta = JSON.stringify({ pullRequestId: input.pr.id, url: input.url });
	const ids = input.linked.map((ticket) => ticket.id);
	await tx.execute(sql`UPDATE tickets SET updated_at = ${input.at} WHERE id = ANY(${textArray(ids)})`);
	await tx.execute(sql`
		INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, meta, created_at)
		VALUES ${sql.join(
			input.linked.map(
				(ticket) => sql`(
					${batchId}, ${ticket.root_id}, ${ticket.project_id}, ${ticket.id},
					${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, 'pr.linked', ${meta}::jsonb, ${input.at}
				)`,
			),
			sql`, `,
		)}
	`);
	const links = await linkedTickets(tx, [input.pr.id]);
	emit({
		type: "pr.linked",
		id: input.pr.id,
		ticketIds: links.map((link) => link.ticket_id),
		projectIds: [...new Set(links.map((link) => link.project_id))],
		state: input.pr.state,
		ciState: input.pr.ci_state,
	});
};

type LinkInput = { at: Date; ref: PullRequestRef; listed: ListedPullRequest; tickets: TicketRow[] };

// Links every named ticket to the pull request, as the system actor with
// source auto. A pair that is already linked keeps the link row it has, so a
// link a person made stays manual and its timeline line stays single.
const linkOne = async (tx: Tx, emit: Emit, input: LinkInput): Promise<FreshPr | null> => {
	const { at, ref, listed } = input;
	await touchSystemActor(tx, at);
	await tx.execute(sql`
		INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
		VALUES (${ulid()}, ${ref.owner}, ${ref.repo}, ${ref.number}, ${listed.url}, 'open', ${at}, ${at})
		ON CONFLICT (owner, repo, number) DO NOTHING
	`);
	const [pr] = await rows<StoredPr>(
		tx,
		sql`SELECT id, state, ci_state FROM pull_requests
			WHERE owner = ${ref.owner} AND repo = ${ref.repo} AND number = ${ref.number}`,
	);
	const linked: TicketRow[] = [];
	for (const ticket of input.tickets) {
		const created = await tx.execute(sql`
			INSERT INTO ticket_pull_requests (ticket_id, pull_request_id, source, actor_name, actor_kind, created_at)
			VALUES (${ticket.id}, ${pr!.id}, 'auto', ${SYSTEM_ACTOR.name}, ${SYSTEM_ACTOR.kind}, ${at})
			ON CONFLICT DO NOTHING RETURNING ticket_id
		`);
		if (created.rows.length > 0) linked.push(ticket);
	}
	if (linked.length === 0) return null;
	await announce(tx, emit, { at, pr: pr!, url: listed.url, linked });
	return { id: pr!.id, ref };
};

type ListInput = { at: Date; listed: ListedPullRequest[] };

const linkListed = async (tx: Tx, emit: Emit, input: ListInput) => {
	const fresh: FreshPr[] = [];
	for (const listed of input.listed) {
		const ref = parsePullRequestUrl(listed.url);
		if (ref === null) continue;
		const tickets = await matchTickets(tx, ref, listed);
		if (tickets.length === 0) continue;
		const created = await linkOne(tx, emit, { at: input.at, ref, listed, tickets });
		if (created !== null) fresh.push(created);
	}
	return fresh;
};

// The same run reads the fields of a pull request it just linked, so the
// ticket shows the title, the state, and the checks at once.
const fetchFresh = async (hook: PollerHook, at: Date, entry: FreshPr) => {
	const result = await fetchPullRequests(hook.gh, [entry.ref], "poller");
	if (!result.ok) return;
	const first = result.results[0]!;
	await withTx(hook.db, (tx) =>
		"row" in first
			? upsertPullRequests(tx, at, [first.row])
			: storeFetchErrors(tx, [{ id: entry.id, error: first.error }]),
	);
};

export const run = async (hook: PollerHook) => {
	const at = hook.now();
	const { result: pairs } = await withTx(hook.db, (tx) => declaredRepos(tx));
	const fresh: FreshPr[] = [];
	for (const pair of pairs) {
		const listed = await listOpen(hook.gh, pair);
		if (listed === null) return;
		const { result } = await withTx(hook.db, (tx, emit) => linkListed(tx, emit, { at, listed }), hook.sink);
		fresh.push(...result);
	}
	for (const entry of fresh) await fetchFresh(hook, at, entry);
};
