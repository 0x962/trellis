import type { Check, CiState, LinkedPullRequest, PrState, PullRequest } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import type { ActorRef } from "./support.ts";
import { notFound } from "./support.ts";

export type PrRow = {
	id: string;
	owner: string;
	repo: string;
	number: number;
	url: string;
	title: string;
	state: PrState;
	is_draft: boolean;
	head_ref: string;
	base_ref: string;
	review_state: PullRequest["reviewState"];
	merged_at: string | null;
	closed_at: string | null;
	checks: Check[];
	ci_state: CiState;
	content_hash: string | null;
	fetched_at: string | null;
	fetch_error: string | null;
	created_at: string;
	updated_at: string;
};

export type LinkRow = PrRow & {
	source: LinkedPullRequest["source"];
	actor_name: string;
	actor_display_name: string | null;
	actor_kind: ActorRef["kind"];
};

export const prColumns = sql`
	p.id, p.owner, p.repo, p.number, p.url, p.title, p.state, p.is_draft, p.head_ref, p.base_ref, p.review_state,
	${iso(sql`p.merged_at`)} AS merged_at, ${iso(sql`p.closed_at`)} AS closed_at, p.checks, p.ci_state,
	p.content_hash, ${iso(sql`p.fetched_at`)} AS fetched_at, p.fetch_error,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at
`;

export const toPullRequest = (row: PrRow): PullRequest => ({
	id: row.id,
	owner: row.owner,
	repo: row.repo,
	number: row.number,
	url: row.url,
	title: row.title,
	state: row.state,
	isDraft: row.is_draft,
	headRef: row.head_ref,
	baseRef: row.base_ref,
	reviewState: row.review_state,
	mergedAt: row.merged_at,
	closedAt: row.closed_at,
	checks: row.checks,
	ciState: row.ci_state,
	fetchedAt: row.fetched_at,
	fetchError: row.fetch_error,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export const toLinked = (row: LinkRow, linkedAt: string): LinkedPullRequest => ({
	...toPullRequest(row),
	source: row.source,
	linkedBy: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	linkedAt,
});

export const findRow = async (tx: Tx, id: string): Promise<PrRow> => {
	const [row] = await rows<PrRow>(tx, sql`SELECT ${prColumns} FROM pull_requests p WHERE p.id = ${id}`);
	if (row === undefined) throw notFound("pullRequest", id);
	return row;
};
