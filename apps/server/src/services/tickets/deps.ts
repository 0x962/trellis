import { type Ticket, TicketUpdateDependenciesInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { ticketGet, ticketSummary } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { type Change, record } from "../activity.ts";
import { assertProjectActive, resolveTicket, type TicketRow } from "../refs.ts";
import { assertVersion } from "./rules.ts";

type DependencyNode = Pick<TicketRow, "id" | "identifier">;
type DependencyTarget = DependencyNode & Pick<TicketRow, "projectId" | "version">;
type ParsedDependencyResult = "cycle" | "unchanged" | "written";

const resolveDependencies = async (
	ctx: ServiceCtx,
	tx: Tx,
	target: DependencyTarget,
	refs: readonly string[],
	field: "after" | "notAfter",
) => {
	const resolved = new Map<string, TicketRow>();
	for (const ref of refs) {
		const dependency = await resolveTicket(ctx, tx, ref);
		if (dependency.projectId !== target.projectId) {
			throw invalidInput(field, "A dependency must belong to the same project as its ticket.");
		}
		resolved.set(dependency.id, dependency);
	}
	return resolved;
};

// A new pair closes a cycle when `dependsOnId` can reach `targetId`. UNION
// keeps one row per ticket, so parallel paths do not multiply the work.
const hasDependencyPath = async (tx: Tx, dependsOnId: string, targetId: string) => {
	const found = await rows<{ found: boolean }>(
		tx,
		sql`WITH RECURSIVE reach(id) AS (
			SELECT ${dependsOnId}::text
			UNION
			SELECT d.depends_on_id FROM ticket_deps d JOIN reach ON reach.id = d.ticket_id
		)
		SELECT EXISTS (SELECT 1 FROM reach WHERE id = ${targetId}) AS found`,
	);
	return found[0]!.found;
};

type DependencyStep = { ticketId: string; dependsOnId: string; identifier: string };

// The reach walk keeps the second query to the relevant subgraph. The
// breadth-first search takes the shortest path. The SQL order makes equal
// paths use the same identifier order in every error message.
const findDependencyPath = async (tx: Tx, dependsOnId: string, dependsOnIdentifier: string, targetId: string) => {
	const found = await rows<DependencyStep>(
		tx,
		sql`WITH RECURSIVE reach(id) AS (
			SELECT ${dependsOnId}::text
			UNION
			SELECT d.depends_on_id FROM ticket_deps d JOIN reach ON reach.id = d.ticket_id
		)
		SELECT d.ticket_id AS "ticketId", d.depends_on_id AS "dependsOnId",
			proj.key || '-' || dependency.number AS identifier
		FROM reach
		JOIN ticket_deps d ON d.ticket_id = reach.id
		JOIN tickets dependency ON dependency.id = d.depends_on_id
		JOIN projects proj ON proj.id = dependency.project_id
		ORDER BY d.ticket_id, identifier`,
	);
	const edges = new Map<string, Array<{ id: string; identifier: string }>>();
	for (const step of found) {
		const edge = { id: step.dependsOnId, identifier: step.identifier };
		edges.set(step.ticketId, [...(edges.get(step.ticketId) ?? []), edge]);
	}
	const paths = new Map<string, string[]>([[dependsOnId, [dependsOnIdentifier]]]);
	const queue = [dependsOnId];
	for (const id of queue) {
		for (const dependency of edges.get(id) ?? []) {
			if (paths.has(dependency.id)) continue;
			paths.set(dependency.id, [...paths.get(id)!, dependency.identifier]);
			queue.push(dependency.id);
		}
	}
	return paths.get(targetId)!;
};

const insertDependencies = async (
	ctx: ServiceCtx,
	tx: Tx,
	target: DependencyTarget,
	dependencies: Map<string, TicketRow>,
) => {
	const added: TicketRow[] = [];
	for (const dependency of dependencies.values()) {
		if (dependency.id === target.id) throw invalidInput("after", "A ticket cannot depend on itself.");
		if (await hasDependencyPath(tx, dependency.id, target.id)) {
			const pathIdentifiers = await findDependencyPath(tx, dependency.id, dependency.identifier, target.id);
			const path = [target.identifier, ...pathIdentifiers];
			throw fail("DEPENDENCY_CYCLE", { path }, `The dependency would close this cycle: ${path.join(" -> ")}.`);
		}
		const inserted = await rows<unknown>(
			tx,
			sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
				VALUES (${target.id}, ${dependency.id}, 'manual', ${ctx.now})
				ON CONFLICT (ticket_id, depends_on_id) DO UPDATE SET source = 'manual'
				WHERE ticket_deps.source <> 'manual'
				RETURNING ticket_id`,
		);
		if (inserted.length > 0) added.push(dependency);
	}
	return added;
};

export const addDependencies = async (ctx: ServiceCtx, tx: Tx, target: DependencyTarget, refs: readonly string[]) =>
	insertDependencies(ctx, tx, target, await resolveDependencies(ctx, tx, target, refs, "after"));

export const addParsedDependency = async (
	ctx: ServiceCtx,
	tx: Tx,
	target: DependencyNode,
	dependency: DependencyNode,
): Promise<ParsedDependencyResult> => {
	if (await hasDependencyPath(tx, dependency.id, target.id)) return "cycle";
	const writtenRows = await rows<unknown>(
		tx,
		sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
			VALUES (${target.id}, ${dependency.id}, 'parsed', ${ctx.now})
			ON CONFLICT (ticket_id, depends_on_id) DO UPDATE
			SET source = 'parsed', created_at = ${ctx.now}
			WHERE ticket_deps.source = 'derived'
			RETURNING ticket_id`,
	);
	return writtenRows.length === 0 ? "unchanged" : "written";
};

export const updateDependencies = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Ticket> => {
	const input = TicketUpdateDependenciesInputSchema.parse(rawInput);
	const target = await resolveTicket(ctx, tx, input.ticket);
	assertProjectActive(ctx, target.projectId);
	await assertVersion(tx, target, input.expectedVersion);
	const additions = await resolveDependencies(ctx, tx, target, input.after ?? [], "after");
	const removals = await resolveDependencies(ctx, tx, target, input.notAfter ?? [], "notAfter");
	if ([...additions.keys()].some((id) => removals.has(id))) {
		throw invalidInput("after", "Do not add and remove the same dependency.");
	}

	const removed: TicketRow[] = [];
	for (const dependency of removals.values()) {
		const deleted = await rows<unknown>(
			tx,
			sql`DELETE FROM ticket_deps
				WHERE ticket_id = ${target.id} AND depends_on_id = ${dependency.id}
				RETURNING ticket_id`,
		);
		if (deleted.length > 0) removed.push(dependency);
	}
	const added = await insertDependencies(ctx, tx, target, additions);
	const changes: Change[] = [
		...removed.map((dependency) => ({ field: "after", from: dependency.identifier, to: null })),
		...added.map((dependency) => ({ field: "after", from: null, to: dependency.identifier })),
	];
	if (changes.length === 0) return ticketGet(tx, target.id);

	const batchId = ulid();
	await tx.execute(sql`UPDATE tickets SET version = version + 1, updated_at = ${ctx.now} WHERE id = ${target.id}`);
	await record(ctx, tx, {
		projectId: target.projectId,
		ticketId: target.id,
		action: "ticket.updated",
		batchId,
		changes,
	});
	ctx.emit({ type: "ticket.updated", summary: await ticketSummary(tx, target.id), fields: ["after"], batchId });
	return ticketGet(tx, target.id);
};
