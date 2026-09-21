import type { Session } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";

export const sessionColumns = sql`id, name, directory, harness, run_id AS "runId",
	(SELECT project_id FROM agent_runs WHERE agent_runs.id = sessions.run_id) AS "projectId",
	(SELECT project_path FROM agent_runs WHERE agent_runs.id = sessions.run_id) AS "projectPath",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

export const resolveSession = async (tx: Tx, ref: string) => {
	const matches = await rows<Session>(
		tx,
		sql`SELECT ${sessionColumns} FROM sessions WHERE id = ${ref} OR run_id = ${ref} OR name = ${ref} ORDER BY id`,
	);
	if (matches.length === 0) throw fail("NOT_FOUND", { kind: "session", ref });
	if (matches.length > 1)
		throw invalidInput(
			"id",
			`More than one session matches ${ref}. Matching ids: ${matches.map((row) => row.id).join(", ")}.`,
		);
	return matches[0]!;
};

export const getSession = async (tx: Tx, id: string) => {
	const [session] = await rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions WHERE id = ${id}`);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: id });
	return session;
};

export const listSessions = (tx: Tx) =>
	rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions ORDER BY created_at DESC, id DESC`);

export const sessionNames = async (tx: Tx) =>
	(await rows<{ name: string }>(tx, sql`SELECT name FROM sessions`)).map((row) => row.name);
