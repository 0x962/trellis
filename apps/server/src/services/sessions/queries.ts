import type { Session } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";

export const sessionColumns = sql`id, name, directory, harness, run_id AS "runId",
	(SELECT project_id FROM agent_runs WHERE agent_runs.id = sessions.run_id) AS "projectId",
	(SELECT project_key FROM agent_runs WHERE agent_runs.id = sessions.run_id) AS "projectKey",
	${iso(sql`created_at`)} AS "createdAt", ${iso(sql`updated_at`)} AS "updatedAt"`;

// Finds the session a person named on the command line. An id or a run id
// wins over a name, because two sessions may hold one name. When the text
// still fits more than one session, the error prints the matching ids and
// the caller passes one of them instead.
const ambiguous = (ref: string, matches: readonly Session[]) =>
	invalidInput("id", `More than one session matches ${ref}. Matching ids: ${matches.map((row) => row.id).join(", ")}.`);

export const resolveSession = async (tx: Tx, ref: string) => {
	const identified = await rows<Session>(
		tx,
		sql`SELECT ${sessionColumns} FROM sessions WHERE id = ${ref} OR run_id = ${ref} ORDER BY id`,
	);
	if (identified.length > 1) throw ambiguous(ref, identified);
	if (identified.length === 1) return identified[0]!;
	const named = await rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions WHERE name = ${ref} ORDER BY id`);
	if (named.length === 0) throw fail("NOT_FOUND", { kind: "session", ref });
	if (named.length > 1) throw ambiguous(ref, named);
	return named[0]!;
};

export const getSession = async (tx: Tx, id: string) => {
	const [session] = await rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions WHERE id = ${id}`);
	if (session === undefined) throw fail("NOT_FOUND", { kind: "session", ref: id });
	return session;
};

export const listSessions = (tx: Tx) =>
	rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions ORDER BY created_at DESC, id DESC`);

// The last path part of every session folder. A new scratch session takes a
// folder name that no row and no folder on disk holds.
export const sessionDirectoryLeaves = async (tx: Tx) =>
	(await rows<{ leaf: string }>(tx, sql`SELECT regexp_replace(directory, '^.*/', '') AS leaf FROM sessions`)).map(
		(row) => row.leaf,
	);
