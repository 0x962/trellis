import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";

// Every fixture inserts through raw SQL with the column names of plan.md, so
// a test pins the schema and not the drizzle objects that describe it.
export type Executor = {
	execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>;
};

export type ActorRef = { name: string; kind: "human" | "agent" | "system" };

export const navid: ActorRef = { name: "navid", kind: "human" };
export const claude: ActorRef = { name: "claude", kind: "agent" };
export const system: ActorRef = { name: "trellis", kind: "system" };

export type Row = Record<string, unknown>;

// Inserts one row and returns it. A jsonb value arrives as an object and
// leaves as an object; every other value is passed as a bound parameter.
// An array value is JSON text: the sql tag expands a raw array into a
// comma list, which is a syntax error for an empty array.
export const insertRow = async (tx: Executor, table: string, row: Row) => {
	const columns = Object.keys(row).map((column) => sql.identifier(column));
	const values = Object.values(row).map((value) =>
		Array.isArray(value) ? sql`${JSON.stringify(value)}::jsonb` : sql`${value}`,
	);
	const result = await tx.execute(
		sql`INSERT INTO ${sql.identifier(table)} (${sql.join(columns, sql`, `)}) VALUES (${sql.join(values, sql`, `)}) RETURNING *`,
	);
	return result.rows[0]!;
};

export const count = async (tx: Executor, table: string) => {
	const result = await tx.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`);
	return result.rows[0]!.n as number;
};

const now = () => new Date();

export const seedRoot = async (tx: Executor, key: string, overrides: Row = {}) => {
	const id = ulid();
	await insertRow(tx, "projects", {
		id,
		parent_id: null,
		root_id: id,
		key,
		slug: key.toLowerCase(),
		name: key,
		description: "",
		ticket_template: "",
		ticket_counter: 0,
		position: 0,
		archived_at: null,
		created_at: now(),
		updated_at: now(),
		...overrides,
	});
	return id;
};

// The name is never the slug, so a slug outside the grammar fails on the slug
// CHECK alone. Postgres evaluates the CHECKs of a row in constraint name order.
export const seedChild = async (tx: Executor, parentId: string, rootId: string, slug: string, overrides: Row = {}) => {
	const id = ulid();
	await insertRow(tx, "projects", {
		id,
		parent_id: parentId,
		root_id: rootId,
		key: null,
		slug,
		name: `Project ${slug}`,
		description: "",
		ticket_template: "",
		ticket_counter: 0,
		position: 0,
		archived_at: null,
		created_at: now(),
		updated_at: now(),
		...overrides,
	});
	return id;
};

export const seedActor = (tx: Executor, actor: ActorRef) =>
	insertRow(tx, "actors", { name: actor.name, kind: actor.kind, first_seen_at: now(), last_seen_at: now() });

// The three actors every service writes. A second call in the same test
// leaves the existing rows in place, so two seeded roots share them.
export const seedActors = async (tx: Executor) => {
	for (const actor of [navid, claude, system]) {
		await tx.execute(
			sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES (${actor.name}, ${actor.kind}, ${now()}, ${now()}) ON CONFLICT (name, kind) DO NOTHING`,
		);
	}
};

export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export type StatusSeed = {
	projectId: string;
	name: string;
	category: "todo" | "started" | "review" | "done" | "canceled";
	position: number;
	reviewer?: "human" | "agent" | null;
	isDefault?: boolean;
	slug?: string;
	color?: string;
	wipLimit?: number | null;
};

export const seedStatus = async (tx: Executor, seed: StatusSeed, overrides: Row = {}) => {
	const id = ulid();
	await insertRow(tx, "statuses", {
		id,
		project_id: seed.projectId,
		name: seed.name,
		slug: seed.slug ?? slugify(seed.name),
		category: seed.category,
		reviewer: seed.reviewer ?? null,
		color: seed.color ?? "fg",
		position: seed.position,
		wip_limit: seed.wipLimit ?? null,
		is_default: seed.isDefault ?? false,
		created_at: now(),
		updated_at: now(),
		...overrides,
	});
	return id;
};

// The six statuses a root is seeded with, in position order.
export const seedStatuses = async (tx: Executor, projectId: string) => ({
	todo: await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true }),
	started: await seedStatus(tx, { projectId, name: "In Progress", category: "started", position: 1 }),
	agentReview: await seedStatus(tx, {
		projectId,
		name: "Agent Review",
		category: "review",
		reviewer: "agent",
		position: 2,
	}),
	humanReview: await seedStatus(tx, {
		projectId,
		name: "Human Review",
		category: "review",
		reviewer: "human",
		position: 3,
	}),
	done: await seedStatus(tx, { projectId, name: "Done", category: "done", position: 4 }),
	canceled: await seedStatus(tx, { projectId, name: "Canceled", category: "canceled", position: 5 }),
});

export type StatusIds = Awaited<ReturnType<typeof seedStatuses>>;

// A root with its six statuses and the actors every service writes.
export const seedProject = async (tx: Executor, key = "CDE") => {
	await seedActors(tx);
	const rootId = await seedRoot(tx, key);
	const statuses = await seedStatuses(tx, rootId);
	return { rootId, statuses };
};

// Every call measures from the instant this module loaded, so two calls
// with the same argument give the same instant and a test compares them.
const loadedAt = Date.now();

export const hoursAgo = (hours: number) => new Date(loadedAt - hours * 3_600_000);

// A further root with its six statuses, for a database whose actors are
// already seeded.
export const seedRootWithStatuses = async (tx: Executor, key: string) => {
	const rootId = await seedRoot(tx, key);
	const statuses = await seedStatuses(tx, rootId);
	return { rootId, statuses };
};

// One declared repository on a project. detect lists the distinct pairs and
// links a pull request only when the ticket's root tree declares its pair.
export const seedRepo = (tx: Executor, projectId: string, owner: string, repo: string) =>
	insertRow(tx, "repos", { id: ulid(), project_id: projectId, owner, repo });

// A chain of `depth` projects under `rootId`, each the child of the one
// before, none with statuses. Returns the ids from the first child to the
// deepest.
export const seedNested = async (tx: Executor, rootId: string, depth: number) => {
	const ids: string[] = [];
	let parentId = rootId;
	for (let level = 1; level <= depth; level++) {
		parentId = await seedChild(tx, parentId, rootId, `p${level}`);
		ids.push(parentId);
	}
	return ids;
};
