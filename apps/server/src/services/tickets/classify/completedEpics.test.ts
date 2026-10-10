import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { create } from "../create.ts";
import { classify } from "./classify.ts";
import { classificationHarness } from "./testSupport";

let fixture: Awaited<ReturnType<typeof classificationHarness>>;
const at = "2026-10-10T16:00:00Z";
beforeAll(async () => {
	fixture = await classificationHarness(at);
}, 30_000);
afterAll(async () => fixture.db.$client.close());

test("automatic placement excludes completed epics but explicit epic and wave choices retain them", async () => {
	const { db, core, h, project, epic, wave, answer } = fixture;
	const p = await project();
	for (const [position, category] of ["todo", "done", "canceled"].entries()) {
		await db.execute(sql`INSERT INTO statuses
			(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
			VALUES (${ulid()}, ${p.id}, ${category}, ${category}, ${category}, 'fg-muted', ${position}, ${position === 0}, ${at}, ${at})`);
	}
	await db.transaction((tx) => core.cache.rebuild(tx));
	const completed = await epic(p.id, "Completed");
	const completedWave = await wave(completed.id, "Work");
	await wave(completed.id, "Empty future wave");
	const active = await epic(p.id, "Active");
	const activeWave = await wave(active.id, "Work");
	const empty = await epic(p.id, "Empty");
	const canceled = await epic(p.id, "Canceled");
	await db.execute(sql`UPDATE epics SET canceled_at = ${at} WHERE id = ${canceled.id}`);
	for (const [epic, wave, status] of [
		[completed.ref, completedWave.ref, "done"],
		[completed.ref, completedWave.ref, "canceled"],
		[active.ref, activeWave.ref, "done"],
		[active.ref, activeWave.ref, "todo"],
	] as const) {
		await db.transaction((tx) => create(core, tx, { project: p.key, title: "Work", epic, wave, status }));
	}
	const input = { project: p.key, title: "New work", description: "" };
	await classify(
		h.ctx,
		input,
		answer((choices) => {
			expect(new Set(Object.values(choices).map((choice) => choice.epic))).toEqual(new Set([active.ref, empty.ref]));
			return Object.keys(choices)[0];
		}),
	);
	for (const selection of [{ epic: completed.ref }, { wave: completedWave.ref }, { epic: canceled.ref }]) {
		const expected = selection.epic ?? completed.ref;
		const result = await classify(
			h.ctx,
			{ ...input, ...selection },
			answer((choices) => {
				expect(Object.values(choices).every((choice) => choice.epic === expected)).toBe(true);
				return Object.keys(choices)[0];
			}),
		);
		expect(result.suggestion.epic).toBe(expected);
	}
});
