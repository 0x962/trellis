import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { HostEndpoint, HostKind } from "../../tables/hosts/index.ts";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";
import { type HostRow, hostColumns, jsonbParam } from "./hostRow.ts";

export type CreateHostInput = {
	name: string;
	kind: HostKind;
	endpoint?: HostEndpoint;
	enrolledIdentity?: string | null;
	hostKeyFingerprint?: string | null;
	os?: string | null;
	arch?: string | null;
	now: Date;
};

// A new host in the `active` state at revision 1. `local` follows `kind`,
// and the index `hosts_local_idx` refuses a second local host.
export const createHost = async (tx: Tx, input: CreateHostInput): Promise<HostRow> => {
	const found = await rows<HostRow>(
		tx,
		sql`
		WITH h AS (
			INSERT INTO hosts
				(id, name, kind, local, endpoint, enrolled_identity, host_key_fingerprint, os, arch, state, created_at, updated_at)
			VALUES (
				${ulid()}, ${input.name}, ${input.kind}, ${input.kind === "local"},
				${jsonbParam(input.endpoint ?? {})}, ${input.enrolledIdentity ?? null},
				${input.hostKeyFingerprint ?? null}, ${input.os ?? null}, ${input.arch ?? null},
				'active', ${input.now}, ${input.now}
			)
			RETURNING *
		)
		SELECT ${hostColumns} FROM h
	`,
	);
	return found[0]!;
};
