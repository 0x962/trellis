import { afterAll, beforeAll, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { loadConfig } from "../../../../src/config.ts";
import type { RequestContext } from "../../../../src/context.ts";
import { createInlineTransport, type Runtime } from "../../../../src/db/transport.ts";
import { createBus } from "../../../../src/events/bus.ts";
import { noGh, signedInGh } from "../../../helpers/ctx.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { freshHomeWithDirs } from "../../../helpers/home.ts";
import { captureStatements } from "../../../helpers/statements.ts";

// The first write after a boot pays for what Postgres loads on first use:
// the catalog entries of the tables and indexes, and the text search
// dictionary behind the generated search columns. `start` pays that cost
// before the first request: it runs the writes a person makes most, then
// rolls them back.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
afterAll(() => h.close());

const runtime: Runtime = {
	version: "0.1.0-test",
	bootId: ulid(),
	gh: noGh,
	ghStatus: signedInGh,
	addresses: async () => ["http://127.0.0.1:4521"],
};

const transportOf = (events: TrellisEvent[]) => {
	const bus = createBus({ bootId: runtime.bootId });
	bus.subscribe((entry) => void events.push(entry.event));
	const config = loadConfig({ TRELLIS_HOME: freshHomeWithDirs(), TRELLIS_DB_INLINE: "true" });
	return createInlineTransport({ db: h.db, bus, config, runtime });
};

const ctx = (): RequestContext => ({
	actor: { kind: "agent", name: "claude" },
	session: null,
	reqId: ulid(),
	now: new Date(),
});

// Every row count a write changes, and the columns a write bumps.
const state = async () =>
	(
		await h.db.execute(sql`SELECT
			(SELECT count(*)::int FROM tickets) AS tickets,
			(SELECT count(*)::int FROM comments) AS comments,
			(SELECT count(*)::int FROM activity) AS activity,
			(SELECT count(*)::int FROM actors) AS actors,
			(SELECT sum(version)::int FROM tickets) AS versions,
			(SELECT sum(ticket_counter)::int FROM projects) AS counters`)
	).rows[0];

test("start runs a ticket write and a comment write, then leaves no row and no event", async () => {
	const seeding = transportOf([]);
	await seeding.start();
	await seeding.call("projects.create", ctx(), { key: "CDE", name: "Code" });
	await seeding.call("tickets.create", ctx(), { project: "CDE", title: "First" });
	await seeding.close();
	const before = await state();

	const events: TrellisEvent[] = [];
	const capture = captureStatements(h.db.$client);
	const booted = transportOf(events);
	try {
		await booted.start();
	} finally {
		capture.restore();
	}

	expect(capture.texts.some((text) => /UPDATE tickets SET title/.test(text))).toBe(true);
	expect(capture.texts.some((text) => /INSERT INTO comments/.test(text))).toBe(true);
	// A create takes the next number from the root counter. A home whose
	// counter lags its numbers must still boot, so start creates no ticket.
	expect(capture.texts.some((text) => /INSERT INTO tickets/.test(text))).toBe(false);
	expect(await state()).toEqual(before);
	expect(events).toEqual([]);
	const updated = (await booted.call("tickets.update", ctx(), { ticket: "CDE-1", title: "Second" })) as {
		version: number;
	};
	expect(updated.version).toBe(2);
	await booted.close();
});

test("start on a database with no ticket writes nothing", async () => {
	await h.reset();
	const capture = captureStatements(h.db.$client);
	try {
		await transportOf([]).start();
	} finally {
		capture.restore();
	}

	expect(capture.texts.some((text) => /UPDATE tickets|INSERT INTO/.test(text))).toBe(false);
});
