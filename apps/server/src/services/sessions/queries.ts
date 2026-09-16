import type { Session } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

export const sessionColumns = sql`id, name, directory, harness, run_id AS "runId",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

export const getSession = async (tx: Tx, id: string) => {
	const [session] = await rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions WHERE id = ${id}`);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: id });
	return session;
};

export const listSessions = (tx: Tx) =>
	rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions ORDER BY created_at DESC, id DESC`);

export const sessionNames = async (tx: Tx) =>
	(await rows<{ name: string }>(tx, sql`SELECT name FROM sessions`)).map((row) => row.name);
