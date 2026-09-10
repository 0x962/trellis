import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Tx } from "../src/db/tx.ts";
import { attachmentsDir, blobPath, TEMP_DIR } from "../src/storage/blobs.ts";

// The status invariant: `tickets.status_id` belongs to owner(ticket.project),
// the nearest ancestor-or-self of the ticket's project that owns statuses.
// One statement walks every ticket's project chain and reports the tickets
// whose status lives elsewhere. The walk stops at depth 64.
export const assertStatusInvariant = async (tx: Tx) => {
	const result = await tx.execute(sql`
		WITH RECURSIVE chain AS (
			SELECT t.id AS ticket_id, p.id AS project_id, p.parent_id, 0 AS depth
			FROM tickets t JOIN projects p ON p.id = t.project_id
			UNION ALL
			SELECT chain.ticket_id, p.id, p.parent_id, chain.depth + 1
			FROM chain JOIN projects p ON p.id = chain.parent_id
			WHERE chain.depth < 64
		), owner AS (
			SELECT DISTINCT ON (ticket_id) ticket_id, project_id AS owner_id
			FROM chain
			WHERE EXISTS (SELECT 1 FROM statuses s WHERE s.project_id = chain.project_id)
			ORDER BY ticket_id, depth
		)
		SELECT root.key || '-' || t.number AS identifier, t.status_id
		FROM tickets t
		JOIN projects root ON root.id = t.root_id
		JOIN statuses s ON s.id = t.status_id
		LEFT JOIN owner ON owner.ticket_id = t.id
		WHERE owner.owner_id IS DISTINCT FROM s.project_id
		ORDER BY identifier
	`);
	const violations = result.rows as Array<{ identifier: string; status_id: string }>;
	if (violations.length === 0) return;
	const lines = violations.map((row) => `${row.identifier} points at status ${row.status_id}`);
	throw new Error(`Status invariant violated: ${lines.join("; ")}`);
};

// The blob invariant: every attachment row has its file on disk, and every
// file under `attachments` has at least one attachment row. The message
// names each sha256 that breaks it, so a failing test says which file is
// missing and which file is spare.
export const assertBlobInvariant = async (tx: Tx, home: string) => {
	const result = await tx.execute(sql`SELECT DISTINCT sha256 FROM attachments ORDER BY sha256`);
	const rowShas = result.rows.map((row) => row.sha256 as string);
	const missing = rowShas.filter((sha) => !existsSync(blobPath(home, sha)));
	const stored = readdirSync(attachmentsDir(home), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== TEMP_DIR)
		.flatMap((entry) => readdirSync(join(attachmentsDir(home), entry.name)));
	const spare = stored.filter((sha) => !rowShas.includes(sha)).sort();
	if (missing.length === 0 && spare.length === 0) return;
	throw new Error(`Blob invariant violated: no file for ${missing.join(", ")}; no row for ${spare.join(", ")}`);
};
