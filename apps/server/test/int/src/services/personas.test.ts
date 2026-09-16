import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ulidPattern } from "@trellis/api";
import { sql } from "drizzle-orm";
import * as personas from "../../../../src/services/personas.ts";
import { expectErrorData, type Harness, NOW, secondsAfter, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("personas", () => {
	test("an empty database lists no personas without a project", async () => {
		expect(await h.run((ctx, tx) => personas.list(ctx, tx, {}))).toEqual([]);
		await h.read(assertStatusInvariant);
	});

	test("create stores a persona and a later transaction reads its fields", async () => {
		const input = { name: "Reviewer", instruction: "Read the diff.\nReport defects with evidence." };
		const created = await h.run((ctx, tx) => personas.create(ctx, tx, input));
		expect(created).toMatchObject({ ...input, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
		expect(created.id).toMatch(ulidPattern);
		const rows = await h.rows(sql`SELECT id, name, instruction FROM personas`);
		expect(rows).toEqual([{ id: created.id, ...input }]);
		expect(await h.run((ctx, tx) => personas.list(ctx, tx, {}))).toEqual([created]);
		await h.read(assertStatusInvariant);
	});

	test("get reads one persona by id and reports a missing id", async () => {
		const created = await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Reviewer", instruction: "Read." }));
		expect(await h.run((ctx, tx) => personas.get(ctx, tx, { id: created.id }))).toEqual(created);
		const data = await expectErrorData(
			h.run((ctx, tx) => personas.get(ctx, tx, { id: "01J9Z000000000000000000009" })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "persona", ref: "01J9Z000000000000000000009" });
		await h.read(assertStatusInvariant);
	});

	test("multiple personas keep separate ids and instructions", async () => {
		const reviewer = await h.run((ctx, tx) =>
			personas.create(ctx, tx, { name: "Reviewer", instruction: "Report defects." }),
		);
		const builder = await h.run((ctx, tx) =>
			personas.create(ctx, tx, { name: "Builder", instruction: "Make the tests pass." }),
		);
		expect(reviewer.id).not.toBe(builder.id);
		const listed = await h.run((ctx, tx) => personas.list(ctx, tx, {}));
		expect(listed).toHaveLength(2);
		expect(listed).toEqual(expect.arrayContaining([reviewer, builder]));
		await h.read(assertStatusInvariant);
	});

	test("update replaces the selected persona and preserves its id and creation time", async () => {
		const first = await h.run((ctx, tx) =>
			personas.create(ctx, tx, { name: "Reviewer", instruction: "Read the diff." }),
		);
		const second = await h.run((ctx, tx) =>
			personas.create(ctx, tx, { name: "Builder", instruction: "Make the tests pass." }),
		);
		const change = { id: first.id, name: "Code reviewer", instruction: "Read each changed file.\nReport defects." };
		const changed = await h.run((ctx, tx) => personas.update(ctx, tx, change), { now: secondsAfter(60) });
		expect(changed).toEqual({
			...change,
			kind: first.kind,
			createdAt: first.createdAt,
			updatedAt: secondsAfter(60).toISOString(),
		});
		const listed = await h.run((ctx, tx) => personas.list(ctx, tx, {}));
		expect(listed).toHaveLength(2);
		expect(listed).toEqual(expect.arrayContaining([changed, second]));
		await h.read(assertStatusInvariant);
	});

	test("update reports an unknown persona without a new row", async () => {
		const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
		const data = await expectErrorData(
			h.run((ctx, tx) => personas.update(ctx, tx, { id, name: "Reviewer", instruction: "Read the diff." })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "persona", ref: id });
		expect(await h.run((ctx, tx) => personas.list(ctx, tx, {}))).toEqual([]);
		await h.read(assertStatusInvariant);
	});
});
