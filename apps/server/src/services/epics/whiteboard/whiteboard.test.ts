import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import type { EpicWhiteboardSnapshot } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { fixture } from "../../../db/epicCancellation/fixture.ts";
import { openTestDbFromArchive } from "../../../db/testDb.ts";
import { create as createWave } from "../../waves/waves.ts";
import { remove } from "../epics.ts";
import { get } from "./get";
import { save } from "./save";

let h: Awaited<ReturnType<typeof fixture>>;
let epicId: string;
const first: EpicWhiteboardSnapshot = {
	store: {
		"shape:ticket": { typeName: "shape", type: "ticket", x: 240, y: 160, props: { ticketId: "ticket-id" } },
		"shape:stroke": {
			typeName: "shape",
			type: "draw",
			props: {
				points: [
					[0, 0],
					[40, 60],
				],
			},
		},
	},
	schema: { schemaVersion: 2 },
};
const second: EpicWhiteboardSnapshot = { store: { "shape:note": { text: "Move the API below the model." } } };
const read = () => h.run((tx) => get(h.ctx(), tx, { epic: epicId }));
const write = (snapshot: EpicWhiteboardSnapshot, expectedRevision: number) =>
	h.run((tx) => save(h.ctx(), tx, { epic: epicId, snapshot, expectedRevision }));

beforeEach(async () => {
	h = await fixture();
	epicId = (await h.create("Whiteboard")).id;
});
afterEach(async () => {
	await h.db.$client.close();
});

test("an epic starts with an empty board and accepts its first revision", async () => {
	expect(await read()).toEqual({ snapshot: null, revision: 0 });
	expect(await write(first, 0)).toEqual({ revision: 1 });
	expect(await h.run((tx) => get(h.ctx(), tx, { epic: "CAN/whiteboard" }))).toEqual({ snapshot: first, revision: 1 });
	expect(await write(second, 1)).toEqual({ revision: 2 });
	expect(await read()).toEqual({ snapshot: second, revision: 2 });
	expect(h.events.at(-1)).toEqual({ type: "epic-whiteboard.changed", projectId: h.projectId, id: epicId, revision: 2 });
});

test("concurrent first saves preserve exactly one document", async () => {
	const results = await Promise.allSettled([write(first, 0), write(second, 0)]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
	expect(rejected.reason).toMatchObject({ code: "EPIC_WHITEBOARD_VERSION_CONFLICT", data: { revision: 1 } });
	const accepted = results[0]?.status === "fulfilled" ? first : second;
	expect(await read()).toEqual({ snapshot: accepted, revision: 1 });
});

test("concurrent updates reject the second copy without an overwrite", async () => {
	await write(first, 0);
	const third = { store: { "shape:another": { text: "Another client" } } };
	const results = await Promise.allSettled([write(second, 1), write(third, 1)]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
	expect(rejected.reason).toMatchObject({ code: "EPIC_WHITEBOARD_VERSION_CONFLICT", data: { revision: 2 } });
	const accepted = results[0]?.status === "fulfilled" ? second : third;
	expect(await read()).toEqual({ snapshot: accepted, revision: 2 });
	await expect(write(first, 0)).rejects.toMatchObject({ code: "EPIC_WHITEBOARD_VERSION_CONFLICT" });
	expect(await read()).toEqual({ snapshot: accepted, revision: 2 });
});

test("a later revision cannot create a missing board", async () => {
	await expect(write(first, 2)).rejects.toMatchObject({
		code: "EPIC_WHITEBOARD_VERSION_CONFLICT",
		data: { revision: 0 },
	});
	expect(await read()).toEqual({ snapshot: null, revision: 0 });
});

test("a stored board survives database reopen and leaves tickets and waves unchanged", async () => {
	await h.ticket(epicId);
	await h.run((tx) => createWave(h.ctx(), tx, { epic: epicId, name: "Build" }));
	const before = await h.get(epicId);
	await write(first, 0);
	expect(await h.get(epicId)).toEqual(before);
	const archive = await h.db.$client.dumpDataDir("none");
	const reopened = await openTestDbFromArchive(archive);
	expect(await reopened.transaction((tx) => get(h.ctx(), tx, { epic: epicId }))).toEqual({
		snapshot: first,
		revision: 1,
	});
	await reopened.$client.close();
});

test("save requires an actor and an active project while archive keeps reads", async () => {
	const input = { epic: epicId, snapshot: first, expectedRevision: 0 };
	await expect(h.run((tx) => save(h.ctx(null), tx, input))).rejects.toMatchObject({ code: "ACTOR_REQUIRED" });
	await write(first, 0);
	await h.db.execute(sql`UPDATE projects SET archived_at = ${h.ctx().now} WHERE id = ${h.projectId}`);
	await h.run((tx) => h.cache.rebuild(tx));
	await expect(write(second, 1)).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
	expect(await read()).toEqual({ snapshot: first, revision: 1 });
});

test("unknown epic refs fail and an epic delete removes its board", async () => {
	const missing = ulid();
	await expect(h.run((tx) => get(h.ctx(), tx, { epic: missing }))).rejects.toMatchObject({ code: "NOT_FOUND" });
	await expect(
		h.run((tx) => save(h.ctx(), tx, { epic: missing, snapshot: first, expectedRevision: 0 })),
	).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	await write(first, 0);
	await h.run((tx) => remove(h.ctx(), tx, { epic: epicId }));
	expect((await h.db.execute(sql`SELECT epic_id FROM epic_whiteboards`)).rows).toEqual([]);
});

test("the migration preserves existing epic and ticket rows", async () => {
	await h.ticket(epicId);
	const before = await h.get(epicId);
	await h.db.execute(sql`DROP TABLE epic_whiteboards`);
	const migration = await readFile(new URL("../../../../drizzle/0150_epic_whiteboards.sql", import.meta.url), "utf8");
	await h.db.$client.exec(migration);
	expect(await h.get(epicId)).toEqual(before);
	expect(await read()).toEqual({ snapshot: null, revision: 0 });
	await write(first, 0);
	expect(await read()).toEqual({ snapshot: first, revision: 1 });
});
