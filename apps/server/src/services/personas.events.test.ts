import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { type Harness, serviceHarness } from "../../test/helpers/services.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import * as personas from "./personas.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe("persona events", () => {
	test("create and update emit the persona id after commit", async () => {
		const created = await h.run((ctx, tx) =>
			personas.create(ctx, tx, { name: "Reviewer", instruction: "Read the diff." }),
		);
		expect(h.flushed).toEqual([{ type: "personas.changed", id: created.id }]);
		await h.run((ctx, tx) =>
			personas.update(ctx, tx, { id: created.id, name: "Builder", instruction: "Make the tests pass." }),
		);
		expect(h.flushed).toEqual([
			{ type: "personas.changed", id: created.id },
			{ type: "personas.changed", id: created.id },
		]);
		await h.read(assertStatusInvariant);
	});

	test("a failed transaction drops the persona and its queued event", async () => {
		const emitted: TrellisEvent[] = [];
		await expect(
			h.runWithSink(
				async (ctx, tx) => {
					await personas.create(ctx, tx, { name: "Reviewer", instruction: "Read the diff." });
					expect(emitted).toEqual([]);
					throw new Error("Rollback persona");
				},
				(events) => {
					emitted.push(...events);
				},
			),
		).rejects.toThrow("Rollback persona");
		expect(emitted).toEqual([]);
		expect(await h.run((ctx, tx) => personas.list(ctx, tx, {}))).toEqual([]);
		await h.read(assertStatusInvariant);
	});
});
