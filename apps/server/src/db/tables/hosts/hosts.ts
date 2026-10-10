import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn } from "../../enums.ts";
import { at } from "../actors.ts";
import { projects } from "../projects.ts";

// The closed sets of the host tables. The API schemas of a later ticket take
// their options from these lists.
export const HOST_KINDS = ["local", "ssh"] as const;
export const HOST_STATES = ["active", "retired", "revoked"] as const;
export const HOST_OBSERVATION_RESULTS = ["reachable", "unreachable", "identity_mismatch", "incompatible"] as const;

export type HostKind = (typeof HOST_KINDS)[number];
export type HostState = (typeof HOST_STATES)[number];
export type HostObservationResult = (typeof HOST_OBSERVATION_RESULTS)[number];

// The connection reference of an ssh host. `credentialRef` names a secret
// that lives outside the database. The database never holds a key, a
// password, or a passphrase.
export type HostEndpoint = {
	alias?: string;
	user?: string;
	port?: number;
	credentialRef?: string;
};

// A host is a machine that runs agents. The id is the durable identity: a
// run, an attempt, a flow execution, and an account point at it with a
// foreign key that refuses the delete of a host they still name. The row
// stays after retirement, so a historical reference keeps its meaning.
// Exactly one row has `local = true`. The migration 0152 inserts that row
// and creates the SQL function `local_host_id()`, which returns its id.
// Every write path that knows no host receives that id through the column
// default `local_host_id()` on the referencing tables.
// `enrolled_identity` is the identity the worker reports at enrollment. A
// rename and an endpoint edit never change it.
// `revision` grows by one on every edit. An edit names the revision it read,
// and a stale revision changes no row.
export const hosts = pgTable(
	"hosts",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		kind: text().notNull(),
		local: boolean().notNull().default(false),
		// A connection reference only. See `HostEndpoint`.
		endpoint: jsonb().$type<HostEndpoint>().notNull().default({}),
		enrolledIdentity: text("enrolled_identity"),
		hostKeyFingerprint: text("host_key_fingerprint"),
		os: text(),
		arch: text(),
		state: text().notNull(),
		retiredAt: at("retired_at"),
		revokedAt: at("revoked_at"),
		revision: integer().notNull().default(1),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("hosts_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) >= 1`),
		checkIn(t.kind, HOST_KINDS),
		check("hosts_local_check", sql`${t.local} = (${t.kind} = 'local')`),
		checkIn(t.state, HOST_STATES),
		check("hosts_revision_check", sql`${t.revision} >= 1`),
		uniqueIndex("hosts_local_idx").on(t.local).where(sql`${t.local}`),
	],
);

// The latest health observation of a host. Health is separate from the
// administrative `state` of the host: a retired host can be reachable, and
// an active host can be unreachable. An observation is a measurement and
// not a durable reference, so the delete of a host removes its observation.
export const hostObservations = pgTable(
	"host_observations",
	{
		hostId: text("host_id")
			.primaryKey()
			.references(() => hosts.id, { onDelete: "cascade" }),
		observedAt: at("observed_at").notNull(),
		result: text().notNull(),
		observedIdentity: text("observed_identity"),
		protocol: integer(),
		capabilities: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		detail: text(),
	},
	(t) => [checkIn(t.result, HOST_OBSERVATION_RESULTS)],
);

// One row per workspace. `singleton` is always true and unique, so a second
// row cannot exist. `controller_owner_epoch` grows by one each time a new
// controller takes the workspace, and a controller that holds an older epoch
// has lost ownership. `default_host_id` is the placement of a run that names
// no host through its ticket or its project.
export const workspaceControl = pgTable(
	"workspace_control",
	{
		id: text().primaryKey(),
		controllerOwnerEpoch: integer("controller_owner_epoch").notNull().default(1),
		defaultHostId: text("default_host_id")
			.notNull()
			.references(() => hosts.id),
		singleton: boolean().notNull().default(true).unique(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("workspace_control_epoch_check", sql`${t.controllerOwnerEpoch} >= 1`),
		check("workspace_control_singleton_check", sql`${t.singleton}`),
	],
);

// The repository directory of a project on one host. The delete of a project
// removes its paths. The delete of a host fails while a path names it.
export const projectHostPaths = pgTable(
	"project_host_paths",
	{
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		hostId: text("host_id")
			.notNull()
			.references(() => hosts.id),
		directory: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.projectId, t.hostId] }),
		check("project_host_paths_directory_check", sql`length(${t.directory}) >= 1`),
		index("project_host_paths_host_id_idx").on(t.hostId),
	],
);
