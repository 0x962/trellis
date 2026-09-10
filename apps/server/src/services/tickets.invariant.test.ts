import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { navid, seedChild, seedProject, seedStatuses } from "../../test/fixtures";
import { serviceHarness } from "../../test/helpers/services.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import * as tickets from "./tickets.ts";

const h = serviceHarness();

describe("status invariant across the service tests", () => {
	test("every service test ends with the status invariant intact", async () => {
		// Every service test file installs the shared hooks, so the status
		// invariant runs after each of its tests.
		const files = readdirSync(import.meta.dir).filter((file) => file.endsWith(".test.ts"));
		const withoutHarness = files.filter(
			(file) => !readFileSync(join(import.meta.dir, file), "utf8").includes("serviceHarness("),
		);
		expect(files.length).toBeGreaterThan(1);
		expect(withoutHarness).toEqual([]);

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
