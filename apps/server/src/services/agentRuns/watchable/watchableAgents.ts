import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { decodeCursor, encodeCursor, isIsoTimestamp, iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { fail } from "../../../errors.ts";

const pageSize = 100;

type WatchableCursor = {
	format: 1;
	projectId: string;
	createdAt: string;
	id: string;
};

const readCursor = (value: string, projectId: string): WatchableCursor => {
	let parsed: unknown;
	try {
		parsed = decodeCursor(value);
	} catch {
		throw fail("INVALID_CURSOR");
	}
	const cursor = parsed as Partial<WatchableCursor> | null;
	if (
		cursor === null ||
		cursor.format !== 1 ||
		cursor.projectId !== projectId ||
		!isIsoTimestamp(cursor.createdAt) ||
		typeof cursor.id !== "string"
	)
		throw fail("INVALID_CURSOR");
	return cursor as WatchableCursor;
};

export async function watchableAgents(
	_ctx: ServiceCtx,
	tx: Tx,
	input: { projectId: string; id?: string; cursor?: string },
) {
	const exact = input.id === undefined ? sql`` : sql`AND id = ${input.id}`;
	const cursor = input.cursor === undefined ? undefined : readCursor(input.cursor, input.projectId);
	const after =
		cursor === undefined ? sql`` : sql`AND (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id})`;
	const found = await rows<{ id: string; name: string; created_at: string }>(
		tx,
		sql`SELECT id, name, ${iso(sql`created_at`)} AS created_at FROM agent_runs
		WHERE project_id = ${input.projectId} AND closed_at IS NULL
		AND runtime = 'native' AND kind <> 'flow' ${exact} ${after}
		ORDER BY created_at DESC, id DESC LIMIT ${pageSize + 1}`,
	);
	const page = found.slice(0, pageSize);
	const last = page.at(-1);
	return {
		items: page.map(({ id, name }) => ({ id, name })),
		nextCursor:
			found.length > pageSize && last !== undefined
				? encodeCursor({ format: 1, projectId: input.projectId, createdAt: last.created_at, id: last.id })
				: null,
	};
}
