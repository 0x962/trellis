import { afterAll, beforeAll, expect, test } from "bun:test";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import { createCache } from "../../../db/cache.ts";
import { openTestDb } from "../../../db/testDb.ts";
import type { ServiceTransport } from "../../../db/transport.ts";
import type { Tx } from "../../../db/tx.ts";
import type { GhAccess } from "../../../ghState.ts";
import type { ProcedureContext } from "../../../procedures/base.ts";
import { tickets } from "../../../procedures/tickets.ts";
import { createDbTiming } from "../../../serverTiming.ts";
import { create as createEpic } from "../../epics/epics.ts";
import type { evaluate } from "../../providers/evaluate";
import type { ProviderFetch } from "../../providers/remote.ts";
import { remoteHarness } from "../../providers/testSupport/testSupport.ts";
import { create as createWave } from "../../waves/waves.ts";
import { classify } from "./classify.ts";
import { classificationResult } from "./result";

let db: Awaited<ReturnType<typeof openTestDb>>;
let h: ReturnType<typeof remoteHarness>;
let core: ServiceCtx;
let inside = false;
const at = "2026-09-30T06:00:00Z";
let number = 0;
const project = async () => {
	const id = ulid();
	const key = `JC${++number}`;
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, ${at}, ${at})`);
	await db.transaction((tx) => core.cache.rebuild(tx));
	return { id, key };
};
const epic = (project: string, name: string) => db.transaction((tx) => createEpic(core, tx, { project, name }));
const wave = (epic: string, name: string) => db.transaction((tx) => createWave(core, tx, { epic, name }));
type Evaluation = Parameters<typeof evaluate>[1];
type Candidate = { epic: string; wave: string | null; description: string };
const answer =
	(choose: (choices: Record<string, Candidate>, input: Evaluation) => string | undefined): ProviderFetch =>
	async (_url, init) => {
		expect(inside).toBe(false);
		const input = JSON.parse(init.body as string) as Evaluation & { state: { candidates: Record<string, Candidate> } };
		const placement = choose(input.state.candidates, input);
		return Response.json({
			answers: {
				priority: { type: "choice", choice: "high" },
				...(placement === undefined ? {} : { placement: { type: "choice", choice: placement } }),
			},
		});
	};
const first = answer((choices) => Object.keys(choices)[0]);

beforeAll(async () => {
	db = await openTestDb();
	h = remoteHarness(db);
	core = {
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
	h.ctx.core = core;
	h.ctx.newTx = async <T>(fn: (tx: Tx) => Promise<T>) => {
		inside = true;
		try {
			return await db.transaction(fn);
		} finally {
			inside = false;
		}
	};
	await h.create({ models: ["typesafe-ai/jev"] });
}, 30_000);
afterAll(async () => db.$client.close());

test("Jev selects a project placement and priority without writing a ticket", async () => {
	const p = await project();
	const one = await epic(p.id, "Database");
	await wave(one.id, "Indexes");
	const two = await epic(p.id, "Interface");
	const selected = await wave(two.id, "Forms");
	const foreign = await project();
	await epic(foreign.id, "Foreign plan");
	const description = "Complete private context ".repeat(3000);
	const prepared = await classify(
		h.ctx,
		{ project: p.key, title: "Fix form", description },
		answer((choices, input) => {
			expect(Object.values(choices)).toHaveLength(2);
			expect(input.state).toMatchObject({ title: "Fix form", description });
			return Object.entries(choices).find(([, choice]) => choice.wave === selected.ref)![0];
		}),
	);
	const result = await db.transaction((tx) => classificationResult(h.ctx, tx, prepared));
	expect(result).toEqual({ epic: two.ref, wave: selected.ref, priority: "high" });
	const count = await db.execute(sql`SELECT count(*)::int AS count FROM tickets WHERE project_id = ${p.id}`);
	expect(count.rows).toEqual([{ count: 0 }]);
	expect(JSON.stringify(h.logs)).not.toContain(description);
});

test("explicit epic and wave choices constrain Jev", async () => {
	const p = await project();
	const selected = await epic(p.id, "Selected");
	const one = await wave(selected.id, "One");
	await wave(selected.id, "Two");
	await epic(p.id, "Other");
	await classify(
		h.ctx,
		{ project: p.key, title: "Work", description: "", epic: selected.ref },
		answer((choices) => {
			expect(Object.values(choices)).toHaveLength(2);
			expect(Object.values(choices).every((choice) => choice.epic === selected.ref)).toBe(true);
			return Object.keys(choices)[0];
		}),
	);
	await classify(
		h.ctx,
		{ project: p.key, title: "Work", description: "", wave: one.id },
		answer((choices) => {
			expect(Object.values(choices)).toHaveLength(1);
			expect(Object.values(choices)[0]!.wave).toBe(one.ref);
			return Object.keys(choices)[0];
		}),
	);
});

test("an empty project and an epic without waves keep normal creation defaults", async () => {
	const p = await project();
	const empty = await classify(
		h.ctx,
		{ project: p.key, title: "Work", description: "" },
		answer((choices, input) => {
			expect(choices).toEqual({});
			expect(input.questions.placement).toBeUndefined();
			return undefined;
		}),
	);
	expect(empty.suggestion).toEqual({ epic: null, wave: null, priority: "high" });
	const selected = await epic(p.id, "Plan");
	const result = await classify(h.ctx, { project: p.key, title: "Work", description: "" }, first);
	expect(result.suggestion).toEqual({ epic: selected.ref, wave: null, priority: "high" });
});

test("foreign and mismatched references fail before a provider call", async () => {
	const p = await project();
	const other = await project();
	const local = await epic(p.id, "Local");
	const foreign = await epic(other.id, "Foreign");
	const localWave = await wave(local.id, "Work");
	const sibling = await epic(p.id, "Sibling");
	const never: ProviderFetch = async () => {
		throw new Error("Unexpected provider call");
	};
	for (const input of [{ epic: foreign.id }, { wave: (await wave(foreign.id, "Work")).id }]) {
		await expect(
			classify(h.ctx, { project: p.key, title: "Work", description: "", ...input }, never),
		).rejects.toMatchObject({ code: "CROSS_PROJECT_LINK" });
	}
	await expect(
		classify(h.ctx, { project: p.key, title: "Work", description: "", epic: sibling.id, wave: localWave.id }, never),
	).rejects.toMatchObject({ code: "WAVE_OUTSIDE_EPIC" });
});

test("deleted choices fail the final database check", async () => {
	const p = await project();
	const selected = await epic(p.id, "Plan");
	const chosen = await wave(selected.id, "Work");
	const prepared = await classify(h.ctx, { project: p.key, title: "Work", description: "" }, first);
	await db.execute(sql`DELETE FROM waves WHERE id = ${chosen.id}`);
	await expect(db.transaction((tx) => classificationResult(h.ctx, tx, prepared))).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
});

test("canceled plans stay out of automatic choices", async () => {
	const p = await project();
	const canceled = await epic(p.id, "Canceled");
	await db.execute(sql`UPDATE epics SET canceled_at = ${at} WHERE id = ${canceled.id}`);
	const available = await epic(p.id, "Available");
	const result = await classify(h.ctx, { project: p.key, title: "Work", description: "" }, first);
	expect(result.suggestion.epic).toBe(available.ref);
});

test("invalid model choices and provider failure never yield a suggestion", async () => {
	const p = await project();
	await epic(p.id, "Plan");
	const input = { project: p.key, title: "Work", description: "" };
	await expect(
		classify(
			h.ctx,
			input,
			answer(() => "invented"),
		),
	).rejects.toThrow("invalid evaluation response");
	await expect(classify(h.ctx, input, async () => new Response("Unavailable", { status: 503 }))).rejects.toThrow(
		"HTTP 503",
	);
});

test("the HTTP endpoint requires an actor and validates the draft before classification", async () => {
	const p = await project();
	const handler = new OpenAPIHandler<ProcedureContext>({ tickets });
	let calls = 0;
	const post = async (title: string, actor: boolean) => {
		const request = new Request("http://trellis.test/api/tickets/classify", {
			method: "POST",
			headers: { "Content-Type": "application/json", ...(actor ? { "x-trellis-actor": "human:Test" } : {}) },
			body: JSON.stringify({ project: p.key, title, description: "Complete context" }),
		});
		const context: ProcedureContext = {
			headers: request.headers,
			reqId: ulid(),
			actor: null,
			timing: createDbTiming(),
			chooseDirectory: async () => null,
			gh: {} as GhAccess,
			transport: {
				call: async (name, requestCtx, input) => {
					calls += 1;
					expect(name).toBe("tickets.classify");
					expect(requestCtx.actor).toEqual(core.actor);
					const prepared = await classify(h.ctx, input, first);
					return db.transaction((tx) => classificationResult(h.ctx, tx, prepared));
				},
			} as ServiceTransport,
		};
		const result = await handler.handle(request, { prefix: "/api", context });
		expect(result.matched).toBe(true);
		return result.response!;
	};
	expect(await (await post("Work", false)).json()).toMatchObject({ code: "ACTOR_REQUIRED" });
	expect(await (await post("  ", true)).json()).toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(calls).toBe(0);
	const response = await post("Work", true);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ epic: null, wave: null, priority: "high" });
	expect(calls).toBe(1);
});
