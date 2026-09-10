import { ulid } from "ulid";
import { type ActorRef, type Executor, insertRow, navid, type Row } from "./projects.ts";

const now = () => new Date();

export type PrSeed = {
	number: number;
	owner?: string;
	repo?: string;
	state?: "open" | "closed" | "merged";
	isDraft?: boolean;
	ciState?: "none" | "pending" | "pass" | "fail";
	reviewState?: string;
	checks?: unknown[];
};

export const seedPr = async (tx: Executor, seed: PrSeed, overrides: Row = {}) => {
	const id = ulid();
	const owner = seed.owner ?? "acme";
	const repo = seed.repo ?? "web";
	await insertRow(tx, "pull_requests", {
		id,
		owner,
		repo,
		number: seed.number,
		url: `https://github.com/${owner}/${repo}/pull/${seed.number}`,
		title: `PR ${seed.number}`,
		state: seed.state ?? "open",
		is_draft: seed.isDraft ?? false,
		head_ref: "feature",
		base_ref: "main",
		review_state: seed.reviewState ?? "none",
		merged_at: null,
		closed_at: null,
		checks: seed.checks ?? [],
		ci_state: seed.ciState ?? "none",
		content_hash: null,
		fetched_at: null,
		fetch_error: null,
		created_at: now(),
		updated_at: now(),
		...overrides,
	});
	return id;
};

export const linkPr = (
	tx: Executor,
	ticketId: string,
	pullRequestId: string,
	actor: ActorRef = navid,
	source = "manual",
) =>
	insertRow(tx, "ticket_pull_requests", {
		ticket_id: ticketId,
		pull_request_id: pullRequestId,
		source,
		actor_name: actor.name,
		actor_kind: actor.kind,
		created_at: now(),
	});

export const seedAttachment = async (tx: Executor, ticketId: string, overrides: Row = {}, actor: ActorRef = navid) => {
	const id = ulid();
	await insertRow(tx, "attachments", {
		id,
		ticket_id: ticketId,
		filename: "notes.txt",
		mime: "text/plain",
		size: 12,
		sha256: "a".repeat(64),
		actor_name: actor.name,
		actor_kind: actor.kind,
		created_at: now(),
		...overrides,
	});
	return id;
};
