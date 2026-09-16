import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as tickets from "../../../../src/services/tickets.ts";
import { dana, seedChild, seedDefaultBuilder, seedProject, seedStatuses } from "../../../fixtures";
import { ticketHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

const h = ticketHarness();

describe("status invariant across the service tests", () => {
	test("every service test ends with the status invariant intact", async () => {
		// Every service test that writes rows proves the status invariant after
		// the writes. `serviceHarness` and `ticketHarness` run
		// `assertStatusInvariant` for the files that take their database from
		// them. A file that opens its own database with `freshDb`, `openDb`, or
		// `diskDb` runs the check itself, so it names `assertStatusInvariant`.
		// This file names all four functions to look for them, so it skips
		// itself.
		const files = readdirSync(import.meta.dir).filter((file) => file.endsWith(".test.ts") && file !== import.meta.file);
		const unchecked = files.filter((file) => {
			const source = readFileSync(join(import.meta.dir, file), "utf8");
			const ownDatabase = source.includes("freshDb(") || source.includes("openDb(") || source.includes("diskDb(");
			return ownDatabase && !source.includes("assertStatusInvariant");
		});
		expect(files.length).toBeGreaterThan(1);
		expect(unchecked).toEqual([]);

		// The moves that touch the invariant, run in sequence, leave every
		// ticket on a status of owner(ticket.project).
		const { rootId } = await seedProject(h.db);
		await seedDefaultBuilder(h.db, rootId);
		const webId = await seedChild(h.db, rootId, rootId, "web");
		await seedStatuses(h.db, webId);
		const { result: a } = await h.as(dana)((ctx, tx) =>
			tickets.create(ctx, tx, { project: "CDE", title: "A", status: "in-progress" }),
		);
		const { result: b } = await h.as(dana)((ctx, tx) => tickets.create(ctx, tx, { project: "CDE.web", title: "B" }));
		await h.as(dana)((ctx, tx) => tickets.update(ctx, tx, { ticket: a.id, project: "CDE.web" }));
		await h.as(dana)((ctx, tx) => tickets.move(ctx, tx, { ticket: b.id, status: "in-progress" }));
		await h.as(dana)((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: [a.id, b.id], project: "CDE" }));
		await h.db.transaction((tx) => assertStatusInvariant(tx));
	});
});
