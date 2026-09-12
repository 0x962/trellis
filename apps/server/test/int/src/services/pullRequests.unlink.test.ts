import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { count, hoursAgo, linkPr, seedPr, seedProject, seedTicket } from "../../../fixtures";
import { eventSink, testCtx, withEmit } from "../../../helpers/ctx.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { caught } from "../../../helpers/errors.ts";
import { freshHomeWithDirs } from "../../../helpers/home.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import { withTx } from "../../../../src/db/tx.ts";
import { unlink } from "../../../../src/services/pullRequests.ts";

// unlink removes the row that joins one ticket to one pull request. The
// pull request row lives as long as a ticket links it, and goes in the same
// transaction as the last link.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

const seedLinked = async (tickets: number) => {
	const { rootId, statuses } = await seedProject(h.db);
	const pr = await seedPr(h.db, { number: 12, ciState: "pass" });
	const ids: string[] = [];
	for (let number = 1; number <= tickets; number++) {
		const ticket = await seedTicket(h.db, {
			projectId: rootId,
			rootId,
			statusId: statuses.todo,
			number,
			updatedAt: hoursAgo(5),
		});
		await linkPr(h.db, ticket, pr);
		ids.push(ticket);
	}
	return { rootId, pr, ids };
};

const runUnlink = async (input: { ticket: string; id: string }) => {
	const handle = testCtx({ db: h.db, home });
	const { delivered, sink } = eventSink();
	const { result } = await withTx(h.db, (tx, emit) => unlink(withEmit(handle.ctx, emit), tx, input), sink);
	return { result, delivered };
};

describe("pullRequests.unlink event scope", () => {
	test("the pr.unlinked event names the ticket the last link left", async () => {
		const { rootId, pr, ids } = await seedLinked(1);

		const { delivered } = await runUnlink({ ticket: "CDE-1", id: pr });

		const [event] = delivered.filter((entry) => entry.type === "pr.unlinked");
		expect(event).toMatchObject({ ticketIds: [ids[0]!], projectIds: [rootId] });
	});
});

describe("pullRequests.unlink", () => {
	test("unlink keeps the row while another ticket links it", async () => {
		const { rootId, pr, ids } = await seedLinked(2);

		const { result, delivered } = await runUnlink({ ticket: "CDE-1", id: pr });

		expect(result).toEqual({ deleted: pr });
		expect(await count(h.db, "pull_requests")).toBe(1);
		const links = await rows("ticket_pull_requests");
		expect(links.map((row) => row.ticket_id)).toEqual([ids[1]!]);
		const expected = [
			{
				type: "pr.unlinked",
				id: pr,
				ticketIds: [ids[0]!, ids[1]!],
				projectIds: [rootId],
				state: "open",
				ciState: "pass",
			},
		] satisfies TrellisEvent[];
		expect(delivered.filter((event) => event.type === "pr.unlinked")).toEqual(expected);
	});

	test("unlink of the last link deletes the orphan pull request row", async () => {
		const { pr } = await seedLinked(1);

		const { result } = await runUnlink({ ticket: "CDE-1", id: pr });

		expect(result).toEqual({ deleted: pr });
		expect(await count(h.db, "pull_requests")).toBe(0);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
	});

	test("unlink emits pr.unlinked and moves the ticket", async () => {
		const { rootId, pr, ids } = await seedLinked(1);
		const [before] = await rows("tickets");

		const { delivered } = await runUnlink({ ticket: "CDE-1", id: pr });

		expect(delivered.filter((event) => event.type === "pr.unlinked")).toHaveLength(1);
		const activity = await rows("activity");
		expect(activity).toHaveLength(1);
		expect(activity[0]).toMatchObject({ root_id: rootId, ticket_id: ids[0]!, action: "pr.unlinked" });
		const [after] = await rows("tickets");
		expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
			new Date(before!.updated_at as string).getTime(),
		);
	});

	test("unlink of a pull request the ticket does not hold is NOT_FOUND", async () => {
		const { pr } = await seedLinked(1);
		const other = await seedPr(h.db, { number: 13 });

		const error = await caught(runUnlink({ ticket: "CDE-1", id: other }));

		expect(error.code).toBe("NOT_FOUND");
		expect(error.data).toEqual({ kind: "pullRequest", ref: other });
		expect(await count(h.db, "pull_requests")).toBe(2);
		expect(await count(h.db, "ticket_pull_requests")).toBe(1);
		expect(pr).toBeString();
	});
});
