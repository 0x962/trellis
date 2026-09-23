import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Project, ProjectColor } from "@trellis/api";
import type { ServiceCtx } from "../context.ts";
import { createCache } from "../db/cache.ts";
import { PROJECT_COLORS } from "../db/enums.ts";
import { openTestDb } from "../db/testDb.ts";
import { type Tx, withTx } from "../db/tx.ts";
import * as projects from "./projects.ts";

// The color a project holds when nobody picks one. Each name of
// `PROJECT_COLORS` is one slot, and one active project holds one slot.

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

// One key per slot, and one more. `AA01` and the rest match the key rule of
// the projects table.
const keys = Array.from({ length: PROJECT_COLORS.length + 1 }, (_, index) => `AA${String(index).padStart(2, "0")}`);

// The projects of the first test, in the order they were created. The last one
// finds no free slot.
const made: Project[] = [];

beforeAll(async () => {
	db = await openTestDb();
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("one project takes one slot, and the project past the last slot takes none", async () => {
	for (const key of keys) made.push(await create(key));
	const colors = made.map((project) => project.color);

	expect(colors.filter((color) => color !== null).sort()).toEqual([...PROJECT_COLORS].sort());
	expect(colors.filter((color) => color === null)).toHaveLength(1);
});

test("the color that an archive frees goes to the next project", async () => {
	const first = made[0]!;
	await archive(first.key);
	const next = await create("BB01");
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
	const second = made[1]!;
	await archive(second.key);
	await create("BB02");
	const back = await run((ctx, tx) => projects.update(ctx, tx, { project: second.key, archived: false }));

	expect(back.color).toBeNull();
});
