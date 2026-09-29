import type { Db } from "../client";

export async function seed(db: Db) {
	const now = "2026-09-29T20:00:00Z";
	const times = { created_at: now, updated_at: now };
	const actor = { actor_name: "fixture", actor_kind: "human" };
	const hash = "a".repeat(64);
	const rows: [string, Record<string, unknown>][] = [
		["actors", { name: "fixture", kind: "human", first_seen_at: now, last_seen_at: now }],
		["actors", { name: "rename", kind: "human", first_seen_at: now, last_seen_at: now }],
		["projects", { id: "p", key: "QA", slug: "qa", name: "Project", ...times }],
		[
			"statuses",
			{ id: "s", project_id: "p", name: "Todo", slug: "todo", category: "todo", color: "muted", position: 0, ...times },
		],
		[
			"epics",
			{ id: "e", project_id: "p", slug: "epic", name: "Epic", description: "界".repeat(200000), ...actor, ...times },
		],
		["waves", { id: "w", epic_id: "e", slug: "wave", name: "Wave", position: 0, ...times }],
		[
			"tickets",
			{
				id: "t",
				project_id: "p",
				status_id: "s",
				epic_id: "e",
				wave_id: "w",
				number: 1,
				title: "Ticket",
				position: 0,
				...times,
			},
		],
		["agent_runs", { id: "run", name: "Agent", kind: "session", instruction: "Read", project_key: "QA", ...times }],
		["sessions", { id: "session", name: "Session", directory: "/fixture", harness: {}, run_id: "run", ...times }],
		[
			"agent_start_requests",
			{ request_id: "request", actor_name: "fixture", actor_kind: "human", run_id: "run", target: {}, created_at: now },
		],
		[
			"attachments",
			{
				id: "attachment",
				ticket_id: "t",
				filename: "file.txt",
				mime: "text/plain",
				size: 1,
				sha256: hash,
				...actor,
				created_at: now,
			},
		],
		[
			"pages",
			{
				id: "page",
				project_id: "p",
				slug: "page",
				title: "Page",
				summary: "Summary",
				creator_actor_name: "fixture",
				creator_actor_kind: "human",
				...actor,
				...times,
			},
		],
		[
			"page_versions",
			{
				page_id: "page",
				number: 1,
				request_id: "version",
				label: "First",
				document_sha256: hash,
				document_size: 1,
				source_path: "index.html",
				...actor,
				created_at: now,
			},
		],
		["page_assets", { page_id: "page", version: 1, path: "asset.txt", sha256: hash, size: 1, mime: "text/plain" }],
		[
			"page_uploads",
			{
				id: "upload",
				project_id: "p",
				sha256: hash,
				size: 1,
				mime: "text/plain",
				original_name: "file.txt",
				...actor,
				created_at: now,
				expires_at: "2026-09-30T20:00:00Z",
			},
		],
		[
			"epic_resources",
			{ id: "doc", epic_id: "e", kind: "doc", name: "Document", body: "界".repeat(200000), ...actor, ...times },
		],
		[
			"epic_resources",
			{ id: "link", epic_id: "e", kind: "link", name: "Link", url: "https://example.test", ...actor, ...times },
		],
		[
			"resource_comments",
			{
				id: "comment",
				resource_id: "doc",
				thread_id: "comment",
				body: "Comment",
				quote: "Quote",
				prefix: "",
				suffix: "",
				...actor,
				...times,
			},
		],
		["notes", { id: "note", project_id: "p", title: "Note", body: "界".repeat(4000), ...actor, ...times }],
		[
			"page_comment_threads",
			{
				id: "thread",
				page_id: "page",
				version: 1,
				anchor_kind: "text",
				anchor: { kind: "text" },
				selected_text: "Text",
				...actor,
				...times,
			},
		],
		["page_comments", { id: "page-comment", thread_id: "thread", body: "Comment", ...actor, ...times }],
		[
			"providers",
			{
				id: "provider",
				name: "Provider",
				kind: "openai-compatible",
				base_url: "https://example.test",
				api_key: "secret",
				...times,
			},
		],
		["provider_models", { provider_id: "provider", model_id: "model" }],
		["label_groups", { id: "group", project_id: "p", name: "Group", ...times }],
		[
			"labels",
			{
				id: "label",
				project_id: "p",
				group_id: "group",
				name: "Label",
				color: "blue",
				description: "Description",
				...times,
			},
		],
		["labels", { id: "ungrouped", project_id: "p", name: "Ungrouped", color: "blue", ...times }],
		["ticket_labels", { ticket_id: "t", label_id: "label", created_at: now }],
	];
	for (const [table, row] of rows) {
		const fields = Object.keys(row)
			.map((key) => `"${key}"`)
			.join(",");
		const params = Object.values(row).map((value) => (typeof value === "object" ? JSON.stringify(value) : value));
		await db.$client.query(
			`INSERT INTO "${table}" (${fields}) VALUES (${params.map((_, i) => `$${i + 1}`).join(",")})`,
			params,
		);
	}
	return [...new Set(rows.map(([table]) => table))];
}
