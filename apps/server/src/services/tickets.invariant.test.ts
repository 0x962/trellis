import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { navid, seedChild, seedProject, seedStatuses } from "../../test/fixtures";
import { ticketHarness } from "../../test/helpers/services.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import * as tickets from "./tickets.ts";

const h = ticketHarness();

describe("status invariant across the service tests", () => {
	test("every service test ends with the status invariant intact", async () => {
		// Every service test gets its database from `serviceHarness` or from
		// `ticketHarness`, and both run `assertStatusInvariant` after every
		// service call. A file that opened its own database would skip that
		// check, so no file in this directory calls `freshDb` or `openDb`.
		// This file names both functions to look for them, so it skips itself.
		const files = readdirSync(import.meta.dir).filter((file) => file.endsWith(".test.ts") && file !== import.meta.file);
		const ownDatabase = files.filter((file) => {
			const source = readFileSync(join(import.meta.dir, file), "utf8");
			return source.includes("freshDb(") || source.includes("openDb(");
		});
		expect(files.length).toBeGreaterThan(1);
		expect(ownDatabase).toEqual([]);

		// The moves that touch the invariant, run in sequence, leave every
		// ticket on a status of owner(ticket.project).
		const { rootId } = await seedProject(h.db);
		const webId = await seedChild(h.db, rootId, rootId, "web");
		await seedStatuses(h.db, webId);
		const { result: a } = await h.as(navid)((ctx, tx) =>
			tickets.create(ctx, tx, { project: "CDE", title: "A", status: "in-progress" }),
		);
		const { result: b } = await h.as(navid)((ctx, tx) => tickets.create(ctx, tx, { project: "CDE.web", title: "B" }));
		await h.as(navid)((ctx, tx) => tickets.update(ctx, tx, { ticket: a.id, project: "CDE.web" }));
		await h.as(navid)((ctx, tx) => tickets.move(ctx, tx, { ticket: b.id, status: "in-progress" }));
		await h.as(navid)((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: [a.id, b.id], project: "CDE" }));
		await h.db.transaction((tx) => assertStatusInvariant(tx));
	});
});
