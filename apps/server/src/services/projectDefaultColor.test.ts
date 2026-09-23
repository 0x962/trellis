import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Project, ProjectColor } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import { openTestDb } from "../db/testDb.ts";
import { type Tx, withTx } from "../db/tx.ts";
import * as projects from "./projects.ts";

// The color a project holds when nobody picks one. The five names are five
// slots, and one active project holds one slot.

const at = new Date("2026-09-23T12:00:00.000Z");

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ReturnType<typeof createCache>;

const ctxOf = (emit: ServiceCtx["emit"]): ServiceCtx => ({
	actor: { name: "test", kind: "human" },
	session: null,
	reqId: "01J00000000000000000000001",
	now: at,
	emit,
	cache,
	actorCache: new Map(),
	dropBlobs: () => undefined,
	publicUrl: "http://127.0.0.1:4521",
});

const run = async <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) => {
	const { result } = await withTx(db, (tx, emit) => call(ctxOf(emit), tx));
	return result;
};

const create = (key: string) => run((ctx, tx) => projects.create(ctx, tx, { key, name: key }));
const archive = (key: string) => run((ctx, tx) => projects.update(ctx, tx, { project: key, archived: true }));

// The six projects of the first test, in the order they were created.
const made: Project[] = [];

beforeAll(async () => {
	db = await openTestDb();
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("six projects take the five colors, and the sixth takes none", async () => {
	for (const key of ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]) made.push(await create(key));
	const colors = made.map((project) => project.color);
	expect(colors.filter((color) => color !== null).sort()).toEqual(["azure", "blue", "orange", "pink", "teal"]);
	expect(colors.filter((color) => color === null)).toHaveLength(1);
});

test("the color that an archive frees goes to the next project", async () => {
	const first = made[0]!;
	await archive(first.key);
	const next = await create("GGG");
	expect(next.color).toBe(first.color);
});

test("a project that comes back takes a free color when another project holds its own", async () => {
	const first = made[0]!;
	const donor = made.find((project) => project.color !== null && project.color !== first.color)!;
	await run((ctx, tx) => projects.update(ctx, tx, { project: donor.key, color: null }));
	const back = await run((ctx, tx) => projects.update(ctx, tx, { project: first.key, archived: false }));
	expect(back.color).toBe(donor.color as ProjectColor);
});

test("a project that comes back to a full set of slots takes no color", async () => {
	await archive("BBB");
	await create("HHH");
	const back = await run((ctx, tx) => projects.update(ctx, tx, { project: "BBB", archived: false }));
	expect(back.color).toBeNull();
});
