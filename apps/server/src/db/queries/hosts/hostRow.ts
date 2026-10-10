import { sql } from "drizzle-orm";
import type { HostEndpoint, HostKind, HostObservationResult, HostState } from "../../tables/hosts/index.ts";
import { iso } from "../support.ts";

export type HostRow = {
	id: string;
	name: string;
	kind: HostKind;
	local: boolean;
	endpoint: HostEndpoint;
	enrolledIdentity: string | null;
	hostKeyFingerprint: string | null;
	os: string | null;
	arch: string | null;
	state: HostState;
	retiredAt: string | null;
	revokedAt: string | null;
	revision: number;
	createdAt: string;
	updatedAt: string;
};

export type HostObservationRow = {
	hostId: string;
	observedAt: string;
	result: HostObservationResult;
	observedIdentity: string | null;
	protocol: number | null;
	capabilities: Record<string, unknown>;
	detail: string | null;
};

// The select list of one `hosts` row under the alias `h`, in the `HostRow`
// shape. Every query that returns a host reads it through this list, so the
// row a caller receives is the same from every function.
export const hostColumns = sql`
	h.id, h.name, h.kind, h.local, h.endpoint,
	h.enrolled_identity AS "enrolledIdentity",
	h.host_key_fingerprint AS "hostKeyFingerprint",
	h.os, h.arch, h.state,
	${iso(sql`h.retired_at`)} AS "retiredAt",
	${iso(sql`h.revoked_at`)} AS "revokedAt",
	h.revision,
	${iso(sql`h.created_at`)} AS "createdAt",
	${iso(sql`h.updated_at`)} AS "updatedAt"
`;

// The select list of one `host_observations` row under the alias `o`.
export const observationColumns = sql`
	o.host_id AS "hostId",
	${iso(sql`o.observed_at`)} AS "observedAt",
	o.result,
	o.observed_identity AS "observedIdentity",
	o.protocol, o.capabilities, o.detail
`;

// A jsonb parameter. The driver sends an object as text, so the cast makes
// the column type explicit.
export const jsonbParam = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
