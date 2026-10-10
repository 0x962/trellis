import { afterAll, beforeAll, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { Ticket } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { ServiceTransport } from "../../../db/transport.ts";
import { type Tx, withTx } from "../../../db/tx.ts";
import type { GhAccess } from "../../../ghState.ts";
import type { ProcedureContext } from "../../../procedures/base.ts";
import { tickets } from "../../../procedures/tickets.ts";
import { createDbTiming } from "../../../serverTiming.ts";
import { create as createEpic } from "../../epics/epics.ts";
import { create as createWave } from "../../waves/waves.ts";
import { create } from "../create.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withTx(db, fn).then(({ result }) => result);
const at = "2026-09-26T04:00:00Z";
let projectNumber = 0;
const project = async () => {
	const id = ulid();
	const key = `CP${++projectNumber}`;
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${id}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await run((tx) => ctx.cache.rebuild(tx));
	return key;
};

beforeAll(async () => {
	db = await openTestDb();
	ctx = {
		actor: { kind: "human", name: "Test" },
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache: createCache(),
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
});
afterAll(async () => db.$client.close());

test("an empty project creates and reuses one default epic and wave", async () => {
	const key = await project();
	const first = await run((tx) => create(ctx, tx, { project: key, title: "First" }));
	const second = await run((tx) => create(ctx, tx, { project: key, title: "Second" }));
	expect(first.epic).toMatchObject({ ref: `${key}/default`, name: "Default" });
	expect(first.wave).toMatchObject({ ref: `${key}/default/default`, name: "Default" });
	expect(second.epic).toEqual(first.epic);
	expect(second.wave).toEqual(first.wave);
	expect(second.number).toBe(2);
});

test("a selected empty epic creates and reuses its default wave", async () => {
	const key = await project();
	const epic = await run((tx) => createEpic(ctx, tx, { project: key, name: "Plan" }));
	const first = await run((tx) => create(ctx, tx, { project: key, title: "First", epic: epic.id }));
	const second = await run((tx) => create(ctx, tx, { project: key, title: "Second", epic: epic.ref }));
	expect(first.wave?.ref).toBe(`${epic.ref}/default`);
	expect(second.wave).toEqual(first.wave);
});

test("existing choices require selection and a wave determines its epic", async () => {
	const key = await project();
	const epic = await run((tx) => createEpic(ctx, tx, { project: key, name: "Plan" }));
	await expect(run((tx) => create(ctx, tx, { project: key, title: "Missing epic" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
		data: { issues: [{ path: ["epic"] }] },
	});
	const wave = await run((tx) => createWave(ctx, tx, { epic: epic.id, name: "First" }));
	await expect(
		run((tx) => create(ctx, tx, { project: key, title: "Missing wave", epic: epic.id })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED", data: { issues: [{ path: ["wave"] }] } });
	const ticket = await run((tx) => create(ctx, tx, { project: key, title: "Selected", wave: wave.id }));
	expect(ticket.epic?.id).toBe(epic.id);
	expect(ticket.wave?.id).toBe(wave.id);
	expect(ticket.number).toBe(1);
	const saved = await db.execute(sql`SELECT epic_id, wave_id FROM tickets WHERE id = ${ticket.id}`);
	expect(saved.rows).toEqual([{ epic_id: epic.id, wave_id: wave.id }]);
});

test("defaults do not select a container when other choices exist", async () => {
	const key = await project();
	const first = await run((tx) => create(ctx, tx, { project: key, title: "Default" }));
	await run((tx) => createWave(ctx, tx, { epic: first.epic!.id, name: "Other" }));
	await expect(
		run((tx) => create(ctx, tx, { project: key, title: "Missing wave", epic: first.epic!.id })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await run((tx) => createEpic(ctx, tx, { project: key, name: "Other" }));
	await expect(run((tx) => create(ctx, tx, { project: key, title: "Missing epic" }))).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("rejects mismatched epics and waves and cross-project references", async () => {
	const key = await project();
	const other = await project();
	const first = await run((tx) => create(ctx, tx, { project: key, title: "First" }));
	const foreign = await run((tx) => create(ctx, tx, { project: other, title: "Foreign" }));
	const epic = await run((tx) => createEpic(ctx, tx, { project: key, name: "Other" }));
	await expect(
		run((tx) => create(ctx, tx, { project: key, title: "Mismatch", epic: epic.id, wave: first.wave!.id })),
	).rejects.toMatchObject({ code: "WAVE_OUTSIDE_EPIC" });
	for (const input of [{ epic: foreign.epic!.id }, { wave: foreign.wave!.id }, { parent: foreign.id }]) {
		await expect(run((tx) => create(ctx, tx, { project: key, title: "Foreign", ...input }))).rejects.toMatchObject({
			code: "CROSS_PROJECT_LINK",
		});
	}
});

test("sub-tickets obey the same selection rule", async () => {
	const key = await project();
	const epic = await run((tx) => createEpic(ctx, tx, { project: key, name: "Plan" }));
	const wave = await run((tx) => createWave(ctx, tx, { epic: epic.id, name: "First" }));
	const parent = await run((tx) => create(ctx, tx, { project: key, title: "Parent", wave: wave.ref }));
	await expect(run((tx) => create(ctx, tx, { project: key, title: "Child", parent: parent.id }))).rejects.toMatchObject(
		{ code: "INPUT_VALIDATION_FAILED" },
	);
	const child = await run((tx) => create(ctx, tx, { project: key, title: "Child", parent: parent.id, wave: wave.ref }));
	expect(child.parent?.id).toBe(parent.id);
	expect(child.epic).toEqual(parent.epic);
	expect(child.wave).toEqual(parent.wave);
});

test("simultaneous creates share defaults and save complete associations", async () => {
	for (const selected of [false, true]) {
		const key = await project();
		const epic = selected ? await run((tx) => createEpic(ctx, tx, { project: key, name: "Plan" })) : undefined;
		const created = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				run((tx) => create(ctx, tx, { project: key, title: `Ticket ${i}`, epic: epic?.id })),
			),
		);
		expect(new Set(created.map((ticket) => ticket.id)).size).toBe(8);
		expect(new Set(created.map((ticket) => ticket.number)).size).toBe(8);
		expect(new Set(created.map((ticket) => ticket.epic!.id)).size).toBe(1);
		expect(new Set(created.map((ticket) => ticket.wave!.id)).size).toBe(1);
		const saved = await db.execute(sql`SELECT t.epic_id, t.wave_id FROM tickets t
			JOIN projects p ON p.id = t.project_id WHERE p.key = ${key}`);
		expect(saved.rows).toHaveLength(8);
		expect(
			saved.rows.every((row) => row.epic_id === created[0]!.epic!.id && row.wave_id === created[0]!.wave!.id),
		).toBe(true);
		const counts = await db.execute(sql`SELECT (SELECT count(*)::int FROM epics WHERE project_id = p.id) AS epics,
			(SELECT count(*)::int FROM waves w JOIN epics e ON e.id = w.epic_id WHERE e.project_id = p.id) AS waves
			FROM projects p WHERE p.key = ${key}`);
		expect(counts.rows).toEqual([{ epics: 1, waves: 1 }]);
	}
});

test("a later failure rolls back the ticket, defaults, and project counter", async () => {
	const key = await project();
	await expect(
		run((tx) => create(ctx, tx, { project: key, title: "Invalid label", labels: ["absent"] })),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
	const saved = await db.execute(sql`SELECT ticket_counter,
		(SELECT count(*)::int FROM epics WHERE project_id = p.id) AS epics FROM projects p WHERE key = ${key}`);
	expect(saved.rows).toEqual([{ ticket_counter: 0, epics: 0 }]);
});

const handler = new OpenAPIHandler<ProcedureContext>(
	{ tickets },
	{
		plugins: [new ResponseHeadersPlugin<ProcedureContext>()],
	},
);
const post = async (input: unknown) => {
	const request = new Request("http://trellis.test/api/tickets", {
		method: "POST",
		headers: { "content-type": "application/json", "x-trellis-actor": "human:Test" },
		body: JSON.stringify(input),
	});
	const context: ProcedureContext = {
		headers: request.headers,
		reqId: ulid(),
		actor: null,
		timing: createDbTiming(),
		chooseDirectory: async () => null,
		gh: {} as GhAccess,
		transport: {
			call: (name, requestCtx, body) => {
				expect(name).toBe("tickets.create");
				return run((tx) => create({ ...ctx, ...requestCtx }, tx, body));
			},
		} as ServiceTransport,
	};
	const result = await handler.handle(request, { prefix: "/api", context });
	expect(result.matched).toBe(true);
	return result.response!;
};

test("the HTTP API returns saved defaults and rejects missing or null selections", async () => {
	const key = await project();
	const response = await post({ project: key, title: "From HTTP" });
	expect(response.status).toBe(201);
	const ticket = (await response.json()) as Ticket;
	expect(response.headers.get("location")).toBe(`/api/tickets/${ticket.identifier}`);
	expect(ticket.epic?.ref).toBe(`${key}/default`);
	expect(ticket.wave?.ref).toBe(`${key}/default/default`);
	await run((tx) => createEpic(ctx, tx, { project: key, name: "Plan" }));
	const missing = await post({ project: key, title: "Missing" });
	expect(missing.status).toBe(400);
	expect(await missing.json()).toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const cleared = await post({ project: key, title: "Null", epic: null, wave: null });
	expect(cleared.status).toBe(400);
	const selected = await post({ project: key, title: "Child", parent: ticket.identifier, wave: ticket.wave!.ref });
	expect(selected.status).toBe(201);
	const child = (await selected.json()) as Ticket;
	expect(child.parent?.id).toBe(ticket.id);
	expect(child.wave).toEqual(ticket.wave);
	const saved = await db.execute(sql`SELECT epic_id, wave_id FROM tickets WHERE id = ${child.id}`);
	expect(saved.rows).toEqual([{ epic_id: ticket.epic!.id, wave_id: ticket.wave!.id }]);
});
