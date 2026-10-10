import { type SQL, sql } from "drizzle-orm";
import type { HostEndpoint, HostState } from "../../tables/hosts/index.ts";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostRow, hostColumns, jsonbParam } from "./hostRow.ts";

// A field that is absent stays as it is. A field set to null clears the
// column. `enrolledIdentity` belongs here for the enrollment that first
// records it; a rename or an endpoint edit leaves it out.
export type HostPatch = {
	name?: string;
	endpoint?: HostEndpoint;
	hostKeyFingerprint?: string | null;
	os?: string | null;
	arch?: string | null;
	enrolledIdentity?: string | null;
};

// One UPDATE compares the revision and writes the row. The row changes only
// when `expectedRevision` is the current revision, and the revision then
// grows by one. A stale revision and a missing id both give null.
const compareAndSet = async (tx: Tx, id: string, expectedRevision: number, assignments: SQL[], now: Date) => {
	const found = await rows<HostRow>(
		tx,
		sql`
		WITH h AS (
			UPDATE hosts
			SET ${sql.join([...assignments, sql`revision = revision + 1`, sql`updated_at = ${now}`], sql`, `)}
			WHERE id = ${id} AND revision = ${expectedRevision}
			RETURNING *
		)
		SELECT ${hostColumns} FROM h
	`,
	);
	return found[0] ?? null;
};

export const editHost = async (
	tx: Tx,
	input: { id: string; expectedRevision: number; patch: HostPatch; now: Date },
): Promise<HostRow | null> => {
	const { patch } = input;
	const assignments: SQL[] = [];
	if (patch.name !== undefined) assignments.push(sql`name = ${patch.name}`);
	if (patch.endpoint !== undefined) assignments.push(sql`endpoint = ${jsonbParam(patch.endpoint)}`);
	if (patch.hostKeyFingerprint !== undefined) assignments.push(sql`host_key_fingerprint = ${patch.hostKeyFingerprint}`);
	if (patch.os !== undefined) assignments.push(sql`os = ${patch.os}`);
	if (patch.arch !== undefined) assignments.push(sql`arch = ${patch.arch}`);
	if (patch.enrolledIdentity !== undefined) assignments.push(sql`enrolled_identity = ${patch.enrolledIdentity}`);
	return compareAndSet(tx, input.id, input.expectedRevision, assignments, input.now);
};

// `retired` records `retired_at`, `revoked` records `revoked_at`, and
// `active` clears both. Existing references keep their host_id in every
// state.
export const setHostState = async (
	tx: Tx,
	input: { id: string; expectedRevision: number; state: HostState; now: Date },
): Promise<HostRow | null> => {
	const assignments: SQL[] = [sql`state = ${input.state}`];
	if (input.state === "retired") assignments.push(sql`retired_at = ${input.now}`);
	if (input.state === "revoked") assignments.push(sql`revoked_at = ${input.now}`);
	if (input.state === "active") assignments.push(sql`retired_at = NULL`, sql`revoked_at = NULL`);
	return compareAndSet(tx, input.id, input.expectedRevision, assignments, input.now);
};
