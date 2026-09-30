import { readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BackupOutput, GhStatus, Health } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { executionEnvironment } from "../executionEnvironment";
import type { GhRunner } from "../gh/run.ts";
import { backupCommand } from "../storage/backupCommand";
import { BACKUP_MANIFEST, PARTIAL_SUFFIX } from "../storage/backups.ts";
import { prepareSystemSnapshot } from "./prepareSystemSnapshot";
import type { ServiceCtx } from "./support.ts";

// The three answers a person needs about the running server: is it healthy,
// can it reach GitHub, and is the data safe. A backup is one archive of the
// data directory, the attachments, and Page objects. The export is every row as NDJSON, so
// nobody is locked into this database.

export type EmptyInput = Record<string, never>;

// The number of archives `<home>/backups` keeps. An older one is removed
// after a new one is written.
const KEEP_ARCHIVES = 10;

// Rows per keyset page of the export. One page is in memory at a time.
const EXPORT_PAGE_ROWS = 1000;

// The shape of the export. A reader checks this before it reads the rows.
export const EXPORT_VERSION = 1;

export const health = async (ctx: ServiceCtx, tx: Tx, input: EmptyInput): Promise<Health> => {
	const [row] = await rows<{ bytes: number }>(tx, sql`SELECT pg_database_size(current_database())::bigint AS bytes`);
	return {
		ok: true,
		version: ctx.version,
		apiVersion: ctx.apiVersion,
		bootId: ctx.bootId,
		rss: process.memoryUsage.rss(),
		addresses: await ctx.addresses(),
		db: { ok: true, sizeBytes: Number(row!.bytes) },
		gh: ctx.ghStatus(),
	};
};

// `gh auth status` prints "Logged in to github.com account <login>" when a
// token is present.
const ACCOUNT = /account (\S+)/;

// A gh that is missing or signed out is an answer, not a failure: the web
// shows a banner and the server keeps running.
export const checkGh = async (runner: GhRunner, at: Date): Promise<GhStatus> => {
	const result = await runner("interactive", ["auth", "status"]);
	const checkedAt = at.toISOString();
	if (!result.ok) return { ok: false, user: null, reason: result.reason, message: result.message, checkedAt };
	return { ok: true, user: ACCOUNT.exec(result.stdout)?.[1] ?? null, reason: null, message: null, checkedAt };
};

// Keeps the newest KEEP_ARCHIVES archives and removes the rest.
const pruneArchives = (dir: string) => {
	const archives = readdirSync(dir)
		.filter((name) => name.startsWith("trellis-") && name.endsWith(".tar.gz"))
		.map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
		.sort((a, b) => b.at - a.at);
	for (const archive of archives.slice(KEEP_ARCHIVES)) unlinkSync(join(dir, archive.name));
};

// `staging` is the copy under `backups/`. `path` is the archive file.
export type Snapshot = { staging: string; path: string };

export const prepareSnapshot = async (ctx: ServiceCtx, _input: EmptyInput): Promise<Snapshot> => {
	const { staging, path } = await prepareSystemSnapshot(ctx, async () => undefined);
	return { staging, path };
};

// Build the archive from the snapshot. Then remove the snapshot. Keep the newest archives.
// The archive function reads no database, so the HTTP process runs it.
// The archive holds `db/`, `attachments/`, and `pages/` at its root.
// Tar writes the `.partial` name first. The archive function renames it when tar exits 0.
// A failed tar leaves neither the snapshot nor the partial file.
export const archive = async (taken: Snapshot): Promise<BackupOutput> => {
	const partial = `${taken.path}${PARTIAL_SUFFIX}`;
	try {
		await backupCommand(
			["tar", "-czf", partial, "-C", taken.staging, "db", "attachments", "pages", BACKUP_MANIFEST],
			await executionEnvironment(),
		);
		renameSync(partial, taken.path);
	} finally {
		rmSync(taken.staging, { recursive: true, force: true });
		rmSync(partial, { force: true });
	}
	pruneArchives(dirname(taken.path));
	return { path: taken.path, bytes: statSync(taken.path).size };
};

// A whole backup in one call: the snapshot, then its archive.
export const backup = async (ctx: ServiceCtx, input: EmptyInput): Promise<BackupOutput> =>
	archive(await prepareSnapshot(ctx, input));

// These non-null columns identify one row through each table's equality exclusion constraint.
const EXCLUSION_KEYS: Record<string, string[]> = {
	provider_models: ["provider_id", "model_id"],
	agent_start_requests: ["actor_kind", "actor_name", "request_id"],
	langflow_start_receipts: ["actor_kind", "actor_name", "request_id"],
};

// The columns a row of this table is ordered and paged by, in key order.
const exportKeys = async (tx: Tx) => {
	const found = await rows<{ table_name: string; column_name: string }>(
		tx,
		sql`
			SELECT c.relname AS table_name, a.attname AS column_name
			FROM pg_index i
			JOIN pg_class c ON c.oid = i.indrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
			JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
			WHERE i.indisprimary AND n.nspname = 'public'
			ORDER BY c.relname, k.ord
		`,
	);
	const keys = new Map(Object.entries(EXCLUSION_KEYS));
	for (const row of found) keys.set(row.table_name, [...(keys.get(row.table_name) ?? []), row.column_name]);
	return keys;
};

const tableNames = async (tx: Tx) => {
	const found = await rows<{ table_name: string }>(
		tx,
		sql`
			SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
			ORDER BY table_name
		`,
	);
	return found.map((row) => row.table_name);
};

// What a reader needs and the columns do not carry: the ticket identifier a
// person types, and the path that serves the bytes of an attachment.
const EXTRA_COLUMNS: Record<string, SQL> = {
	tickets: sql`, (SELECT p.key FROM projects p WHERE p.id = t.project_id) || '-' || t.number AS identifier`,
	attachments: sql`, '/api/attachments/' || t.id || '/file' AS url`,
};

const REDACTED_COLUMNS: Record<string, readonly string[]> = {
	providers: ["api_key"],
};

const tableColumns = async (tx: Tx) => {
	const found = await rows<{ table_name: string; column_name: string }>(
		tx,
		sql`SELECT table_name, column_name FROM information_schema.columns
			WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
	);
	const columns = new Map<string, string[]>();
	for (const row of found) columns.set(row.table_name, [...(columns.get(row.table_name) ?? []), row.column_name]);
	return columns;
};

const pageQuery = (table: string, key: string[], columns: string[], after: unknown[] | null): SQL => {
	const keys = sql.join(
		key.map((column) => sql.identifier(column)),
		sql`, `,
	);
	const redacted = new Set(REDACTED_COLUMNS[table] ?? []);
	const selected = sql.join(
		columns.map((column) =>
			redacted.has(column)
				? sql`'<redacted>' AS ${sql.identifier(column)}`
				: sql`${sql.identifier("t")}.${sql.identifier(column)}`,
		),
		sql`, `,
	);
	const extra = EXTRA_COLUMNS[table] ?? sql``;
	const where =
		after === null
			? sql``
			: sql`WHERE (${keys}) > (${sql.join(
					after.map((value) => sql`${value}`),
					sql`, `,
				)})`;
	return sql`SELECT ${selected}${extra} FROM ${sql.identifier(table)} t ${where} ORDER BY ${keys} LIMIT ${EXPORT_PAGE_ROWS}`;
};

type ExportRow = Record<string, unknown>;

// One JSON object per line: the header first, then one line per row tagged
// with its table. Each table is read in keyset pages, so a table of a million
// rows never sits in memory. The whole export runs in one transaction, so
// every page reads the same snapshot.
export async function* exportNdjson(ctx: ServiceCtx, tx: Tx, input: EmptyInput): AsyncGenerator<string> {
	yield `${JSON.stringify({ version: EXPORT_VERSION, exportedAt: ctx.now().toISOString() })}\n`;
	const keys = await exportKeys(tx);
	const columns = await tableColumns(tx);
	for (const table of await tableNames(tx)) {
		const key = keys.get(table)!;
		let after: unknown[] | null = null;
		for (;;) {
			const page: ExportRow[] = await rows<ExportRow>(tx, pageQuery(table, key, columns.get(table)!, after));
			for (const row of page) yield `${JSON.stringify({ table, row })}\n`;
			if (page.length < EXPORT_PAGE_ROWS) break;
			after = key.map((column) => page[page.length - 1]![column]);
		}
	}
}
