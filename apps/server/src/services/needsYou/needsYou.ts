import {
	NeedsYouListInputSchema,
	type NeedsYouListOutput,
	type NeedsYouSort,
	NeedsYouUpdateInputSchema,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { ticketSummaries } from "../../db/queries/ticketSummaries.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { type Candidate, candidates } from "./candidates.ts";

const person = (ctx: ServiceCtx) => {
	const actor = requireActor(ctx);
	if (actor.kind !== "human") throw invalidInput("actor", "Needs you requires a human actor.");
	return actor.name;
};
const visibility = (item: Candidate, now: Date) =>
	item.ignored ? "ignored" : item.snoozedUntil !== null && item.snoozedUntil > now.toISOString() ? "snoozed" : "active";
const key = (item: Candidate, sort: NeedsYouSort) => {
	if (sort === "priority" || sort === "-priority") {
		const order =
			sort === "priority" ? ["urgent", "high", "medium", "low", "none"] : ["low", "medium", "high", "urgent", "none"];
		return String(order.indexOf(item.priority));
	}
	if (sort === "title" || sort === "-title") return item.title.toLowerCase();
	return sort.endsWith("createdAt") ? item.createdAt : item.updatedAt;
};
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const list = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<NeedsYouListOutput> => {
	const input = NeedsYouListInputSchema.parse(rawInput);
	const actor = person(ctx);
	const query = JSON.stringify([actor, input.section, input.visibility, input.sort, input.ticket]);
	if (input.cursor && input.cursor.query !== query)
		throw invalidInput("cursor", "The cursor belongs to another inbox query.");
	const direction = input.sort.startsWith("-") && input.sort !== "-priority" ? -1 : 1;
	const compare = (a: { key: string; age: string; id: string }, b: { key: string; age: string; id: string }) =>
		direction * compareText(a.key, b.key) || compareText(a.age, b.age) || compareText(a.id, b.id);
	const sorted = (await candidates(tx, actor))
		.filter(
			(item) =>
				(!input.section || item.section === input.section) &&
				visibility(item, ctx.now) === input.visibility &&
				(!input.ticket || item.identifier === input.ticket.toUpperCase() || item.ticketId === input.ticket),
		)
		.map((item) => ({ item, key: key(item, input.sort), age: item.createdAt, id: item.id }))
		.filter((item) => !input.cursor || compare(item, input.cursor) > 0)
		.sort(compare);
	const page = sorted.slice(0, input.limit);
	const summaries = new Map(
		(await ticketSummaries(tx, [...new Set(page.map(({ item }) => item.ticketId))])).map((ticket) => [
			ticket.id,
			ticket,
		]),
	);
	const last = page.at(-1);
	return {
		items: page.map(({ item }) => ({
			id: item.id,
			section: item.section,
			ticket: summaries.get(item.ticketId)!,
			receivedAt: item.receivedAt,
			snoozedUntil: item.snoozedUntil,
			ignored: item.ignored,
			comment: item.comment,
		})),
		nextCursor: sorted.length > input.limit && last ? { query, key: last.key, age: last.age, id: last.id } : null,
	};
};

export const summary = async (ctx: ServiceCtx, tx: Tx, _input: unknown) => {
	const items = await candidates(tx, person(ctx));
	const result = { active: 0, review: 0, mentioned: 0, snoozed: 0, ignored: 0, nextWakeAt: null as string | null };
	for (const item of items) {
		const state = visibility(item, ctx.now);
		result[state]++;
		if (state === "active") result[item.section]++;
		if (state === "snoozed" && (result.nextWakeAt === null || item.snoozedUntil! < result.nextWakeAt))
			result.nextWakeAt = item.snoozedUntil;
	}
	return result;
};

export const update = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown) => {
	const input = NeedsYouUpdateInputSchema.parse(rawInput);
	const actor = person(ctx);
	if (input.action === "snooze" && new Date(input.until) <= ctx.now)
		throw invalidInput("until", "Choose a future time.");
	const item = (await candidates(tx, actor)).find((candidate) => candidate.id === input.id);
	if (!item) throw fail("NOT_FOUND", { kind: "inbox item", ref: input.id });
	await tx.execute(sql`INSERT INTO needs_you_states (actor_name,item_id,ticket_id,snoozed_until,ignored,updated_at)
		VALUES (${actor},${item.id},${item.ticketId},${input.action === "snooze" ? input.until : null},${input.action === "ignore"},${ctx.now})
		ON CONFLICT (actor_name,item_id) DO UPDATE SET snoozed_until=EXCLUDED.snoozed_until,ignored=EXCLUDED.ignored,updated_at=EXCLUDED.updated_at`);
	ctx.emit({ type: "needs-you.changed", actorName: actor });
	return { id: item.id };
};
