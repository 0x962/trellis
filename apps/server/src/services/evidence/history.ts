import type {
	EvidenceHistory,
	EvidenceHistoryInput,
	EvidenceHistoryItem,
	EvidenceStoredArtifact,
	EvidenceStoredCheck,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { decodeCursor, encodeCursor, InvalidCursorError, isIsoTimestamp, iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import { getRun } from "../agentRuns/queries.ts";

type HistoryCursor = { at: string; kind: number; key: string };
type HistoryRow = {
	kind: "check" | "artifact";
	kind_rank: number;
	sort_key: string;
	document: EvidenceStoredCheck | EvidenceStoredArtifact;
	created_at: string;
};

const readCursor = (before: string): HistoryCursor => {
	let decoded: unknown;
	try {
		decoded = decodeCursor(before);
	} catch {
		throw new InvalidCursorError();
	}
	if (decoded === null || typeof decoded !== "object") throw new InvalidCursorError();
	const { at, kind, key } = decoded as { at?: unknown; kind?: unknown; key?: unknown };
	if (!isIsoTimestamp(at) || (kind !== 0 && kind !== 1) || typeof key !== "string") throw new InvalidCursorError();
	return { at, kind, key };
};

const afterCursor = (cursor: HistoryCursor) =>
	sql`(created_at, kind_rank, sort_key) < (${cursor.at}::timestamptz, ${cursor.kind}::int, ${cursor.key})`;

const toItem = (row: HistoryRow): EvidenceHistoryItem =>
	row.kind === "check"
		? { kind: "check", check: row.document as EvidenceStoredCheck }
		: { kind: "artifact", artifact: row.document as EvidenceStoredArtifact };

export const history = async (_ctx: ServiceCtx, tx: Tx, input: EvidenceHistoryInput): Promise<EvidenceHistory> => {
	try {
		await getRun(tx, input.runId);
		const start = input.before === undefined ? sql`true` : afterCursor(readCursor(input.before));
		const found = await rows<HistoryRow>(
			tx,
			sql`SELECT kind, kind_rank, sort_key, document, ${iso(sql`created_at`)} AS created_at
			FROM (
				SELECT 'check' AS kind, 1 AS kind_rank, id AS sort_key, document, created_at
				FROM evidence_checks WHERE run_id = ${input.runId}
				UNION ALL
				SELECT 'artifact', 0, id, document, created_at
				FROM evidence_artifacts WHERE run_id = ${input.runId}
			) evidence_history
			WHERE ${start}
			ORDER BY created_at DESC, kind_rank DESC, sort_key DESC
			LIMIT ${input.limit + 1}`,
		);
		const rowsInPage = found.slice(0, input.limit);
		const last = rowsInPage.at(-1);
		return {
			items: rowsInPage.map(toItem),
			nextCursor:
				found.length > input.limit && last !== undefined
					? encodeCursor({ at: last.created_at, kind: last.kind_rank, key: last.sort_key } satisfies HistoryCursor)
					: null,
		};
	} catch (error) {
		if (error instanceof InvalidCursorError) throw fail("INVALID_CURSOR");
		throw error;
	}
};
