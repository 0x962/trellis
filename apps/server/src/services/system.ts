import { mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BackupOutput, GhStatus, Health } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import type { GhRunner } from "../gh/run.ts";
import { PARTIAL_SUFFIX, SNAPSHOT_PREFIX } from "../storage/backups.ts";
import type { ServiceCtx } from "./support.ts";

// The three answers a person needs about the running server: is it healthy,
// can it reach GitHub, and is the data safe. A backup is one archive of the
// data directory and the attachments. The export is every row as NDJSON, so
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

export const gh = (ctx: ServiceCtx, tx: Tx, input: EmptyInput): Promise<GhStatus> => checkGh(ctx.gh, ctx.now());

// `2026-09-09T10-00-00-000Z`: the ISO stamp with every colon and dot as a
// dash, so the name is a file name on every platform and sorts by time.
const stampOf = (at: Date) => at.toISOString().replace(/[:.]/g, "-");

// Keeps the newest KEEP_ARCHIVES archives and removes the rest.
const pruneArchives = (dir: string) => {
	const archives = readdirSync(dir)
		.filter((name) => name.startsWith("trellis-") && name.endsWith(".tar.gz"))
		.map((name) => ({ name, at: statSync(join(dir, name)).mtimeMs }))
		.sort((a, b) => b.at - a.at);
	for (const archive of archives.slice(KEEP_ARCHIVES)) unlinkSync(join(dir, archive.name));
};

// A copy of `db/` and `attachments/` under `backups/`, and the path its
// archive gets.
export type Snapshot = { staging: string; path: string };

// Runs a copy or an archive command and throws with its stderr when it
// exits nonzero.
const run = async (command: string[]) => {
	const proc = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" });
	const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
	if (code !== 0) throw new Error(`${command[0]} exited ${code}: ${stderr.trim()}`);
};

// APFS and btrfs copy a file by reference, so a snapshot at 50k tickets
// takes milliseconds and no disk. Another file system copies the bytes.
const copyArgs = process.platform === "darwin" ? ["cp", "-cR"] : ["cp", "-R", "--reflink=auto"];

// CHECKPOINT writes every dirty page to the data directory first, so the
// snapshot holds a database that opens without a replay. The database
// worker runs nothing else until this returns, so the database files and the
// blobs in the snapshot agree. PGlite runs no autovacuum, so the busy tables
// are vacuumed once the transaction commits.
export const snapshot = async (ctx: ServiceCtx, tx: Tx, input: EmptyInput): Promise<Snapshot> => {
	ctx.afterCommit(ctx.vacuum);
	await tx.execute(sql`CHECKPOINT`);
	const dir = join(ctx.home, "backups");
	const stamp = stampOf(ctx.now());
	const staging = join(dir, `${SNAPSHOT_PREFIX}${stamp}`);
	mkdirSync(staging, { recursive: true });
	try {
		await run([...copyArgs, join(ctx.home, "db"), join(ctx.home, "attachments"), staging]);
	} catch (error) {
		rmSync(staging, { recursive: true, force: true });
		throw error;
	}
	return { staging, path: join(dir, `trellis-${stamp}.tar.gz`) };
};

// Compresses a snapshot into its archive, removes the snapshot, and keeps
// the newest archives. It reads no database, so the HTTP process runs it and
// no request waits for the compression. The archive is a data home again:
// `db/` and `attachments/` at its root, so a restore is an extract. tar
// writes the `.partial` name, and only an archive tar finished gets the
// final name. A failed tar leaves neither the snapshot nor the partial file.
export const archive = async (taken: Snapshot): Promise<BackupOutput> => {
	const partial = `${taken.path}${PARTIAL_SUFFIX}`;
	try {
		await run(["tar", "-czf", partial, "-C", taken.staging, "db", "attachments"]);
		renameSync(partial, taken.path);
	} finally {
		rmSync(taken.staging, { recursive: true, force: true });
		rmSync(partial, { force: true });
	}
	pruneArchives(dirname(taken.path));
	return { path: taken.path, bytes: statSync(taken.path).size };
};

// A whole backup in one call: the snapshot, then its archive.
export const backup = async (ctx: ServiceCtx, tx: Tx, input: EmptyInput): Promise<BackupOutput> =>
	archive(await snapshot(ctx, tx, input));

// The columns a row of this table is ordered and paged by, in key order.
const primaryKeys = async (tx: Tx) => {
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
	const keys = new Map<string, string[]>();
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
	tickets: sql`, (SELECT p.key FROM projects p WHERE p.id = t.root_id) || '-' || t.number AS identifier`,
	attachments: sql`, '/api/attachments/' || t.id || '/file' AS url`,
};

const pageQuery = (table: string, key: string[], after: unknown[] | null): SQL => {
	const columns = sql.join(
		key.map((column) => sql.identifier(column)),
		sql`, `,
	);
	const extra = EXTRA_COLUMNS[table] ?? sql``;
	const where =
		after === null
			? sql``
			: sql`WHERE (${columns}) > (${sql.join(
					after.map((value) => sql`${value}`),
					sql`, `,
				)})`;
	return sql`SELECT t.*${extra} FROM ${sql.identifier(table)} t ${where} ORDER BY ${columns} LIMIT ${EXPORT_PAGE_ROWS}`;
};

type ExportRow = Record<string, unknown>;

// One JSON object per line: the header first, then one line per row tagged
// with its table. Each table is read in keyset pages, so a table of a million
// rows never sits in memory. The whole export runs in one transaction, so
// every page reads the same snapshot.
export async function* exportNdjson(ctx: ServiceCtx, tx: Tx, input: EmptyInput): AsyncGenerator<string> {
	yield `${JSON.stringify({ version: EXPORT_VERSION, exportedAt: ctx.now().toISOString() })}\n`;
	const keys = await primaryKeys(tx);
	for (const table of await tableNames(tx)) {
		const key = keys.get(table)!;
		let after: unknown[] | null = null;
		for (;;) {
			const page: ExportRow[] = await rows<ExportRow>(tx, pageQuery(table, key, after));
			for (const row of page) yield `${JSON.stringify({ table, row })}\n`;
			if (page.length < EXPORT_PAGE_ROWS) break;
			after = key.map((column) => page[page.length - 1]![column]);
		}
	}
}
