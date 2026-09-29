import type { Db } from "../client.ts";
import { seed } from "../limitRemoval/seed.ts";

export async function seedActorHistory(db: Db) {
	const tables = await seed(db);
	const now = "2026-09-29T20:00:00Z";
	const times = { created_at: now, updated_at: now };
	const actor = { actor_name: "fixture", actor_kind: "human" };
	const rows: [string, Record<string, unknown>][] = [
		["actors", { name: "fixture", kind: "agent", first_seen_at: now, last_seen_at: now }],
		["activity", { batch_id: "batch", project_id: "p", ticket_id: "t", action: "create", ...actor, created_at: now }],
		["comments", { id: "ticket-comment", ticket_id: "t", body: "Retained comment", ...actor, ...times }],
		[
			"pull_requests",
			{
				id: "pr",
				owner: "example",
				repo: "app",
				number: 972,
				url: "https://example.test/pr/972",
				state: "open",
				...times,
			},
		],
		["ticket_pull_requests", { ticket_id: "t", pull_request_id: "pr", source: "manual", ...actor, created_at: now }],
		[
			"pr_evidence",
			{ id: "evidence", pull_request_id: "pr", head_sha: "head", kind: "test", record: {}, ...actor, created_at: now },
		],
		["pr_evidence_documents", { pull_request_id: "pr", head_sha: "head", body: "Proof", ...actor, ...times }],
		[
			"pr_files",
			{
				id: "pr-file",
				pull_request_id: "pr",
				blob_sha256: "a".repeat(64),
				filename: "proof.txt",
				mime: "text/plain",
				size: 1,
				...actor,
				created_at: now,
			},
		],
		["pr_flow_waivers", { pull_request_id: "pr", head_sha: "head", reason: "Retained reason", ...actor, ...times }],
		["page_pins", { page_id: "page", ...actor, created_at: now }],
		["page_pins", { page_id: "page", actor_name: "fixture", actor_kind: "agent", created_at: now }],
		[
			"pages",
			{
				id: "deleted-page",
				project_id: "p",
				slug: "deleted-page",
				title: "Deleted page",
				creator_actor_name: "fixture",
				creator_actor_kind: "agent",
				...actor,
				...times,
				deleted_at: now,
				deleted_actor_name: "fixture",
				deleted_actor_kind: "agent",
			},
		],
		[
			"page_comment_threads",
			{
				id: "resolved-thread",
				page_id: "page",
				version: 1,
				anchor_kind: "text",
				anchor: { kind: "text" },
				selected_text: "Retained selection",
				...actor,
				...times,
				resolved_at: now,
				resolved_by_name: "fixture",
				resolved_by_kind: "agent",
			},
		],
		[
			"resource_comments",
			{
				id: "resolved-resource",
				resource_id: "doc",
				thread_id: "resolved-resource",
				body: "Resolved comment",
				...actor,
				...times,
				resolved_at: now,
				resolved_by_name: "fixture",
				resolved_by_kind: "agent",
			},
		],
		[
			"flow_executions",
			{
				id: "legacy-run",
				flow_id: "flow",
				ticket_id: "t",
				project_id: "p",
				...actor,
				request_id: "request",
				request: {},
				doc: {},
				state: {},
				revision: 1,
				...times,
			},
		],
		[
			"langflow_executions",
			{
				execution_id: "engine-run",
				flow_id: "flow",
				ticket_id: "t",
				project_id: "p",
				publication_id: "publication",
				publication: {},
				snapshot: {},
				host_id: "host",
				...actor,
				request_id: "request",
				request_bytes: "request",
				submission_bytes: "submission",
				submission: {},
				admission: {},
				revision: 1,
				created_at: now,
			},
		],
		[
			"langflow_start_receipts",
			{
				...actor,
				request_id: "request",
				request_bytes: "request",
				execution_id: "engine-run",
				langflow_execution_id: "engine-run",
			},
		],
		[
			"native_migrations",
			{
				id: "native",
				project_id: "p",
				actor_name: "fixture",
				request_id: "request",
				request: {},
				before_inventory: {},
				document: {},
				created_at: now,
			},
		],
		["needs_you_states", { actor_name: "fixture", item_id: "item", ticket_id: "t", updated_at: now }],
		[
			"review_submissions",
			{ id: "review", pr_id: "pr", request_id: "request", actor: "fixture", document: {}, created_at: now },
		],
	];
	for (const [table, row] of rows) {
		const fields = Object.keys(row)
			.map((key) => `"${key}"`)
			.join(",");
		const values = Object.values(row).map((value) => (typeof value === "object" ? JSON.stringify(value) : value));
		await db.$client.query(
			`INSERT INTO "${table}" (${fields}) VALUES (${values.map((_, index) => `$${index + 1}`).join(",")})`,
			values,
		);
	}
	return [...new Set([...tables, ...rows.map(([table]) => table)])];
}
