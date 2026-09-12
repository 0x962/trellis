import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { FlowNode, FlowSaveInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import * as flows from "../../../../src/services/flows/flows.ts";
import { save } from "../../../../src/services/flows/save.ts";
import * as personas from "../../../../src/services/personas.ts";
import {
	eventsOfType,
	expectErrorData,
	type Harness,
	NOW,
	secondsAfter,
	serviceHarness,
	ULID,
} from "../../../helpers/services.ts";

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const node = (fields: Partial<FlowNode> = {}): FlowNode => ({
	id: ulid(),
	parentId: null,
	kind: "agent",
	title: "Step",
	personaId: null,
	instruction: "Read the diff.",
	parallel: false,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...fields,
});

const createFlow = (name = "Review") => h.run((ctx, tx) => flows.create(ctx, tx, { name }));
const saveGraph = (input: FlowSaveInput) => h.run((ctx, tx) => save(ctx, tx, input));

describe("flows", () => {
	test("save preserves an unfinished agent and disconnected group steps", async () => {
		const flow = await createFlow();
		const group = node({ kind: "group", parallel: false, instruction: "" });
		const a = node({ parentId: group.id, title: "", instruction: "" });
		const b = node({ parentId: group.id, instruction: "" });
		const doc = await saveGraph({ flow: flow.id, nodes: [group, a, b], edges: [] });
		expect(doc.nodes).toHaveLength(3);
		expect(await h.run((ctx, tx) => flows.get(ctx, tx, { flow: flow.id }))).toEqual(doc);
		expect(doc.nodes.find((row) => row.id === a.id)).toMatchObject({ title: "", instruction: "" });
	});

	test("create derives a slug from the name and takes the next free one on a collision", async () => {
		const first = await createFlow("Code Review!");
		expect(first).toMatchObject({
			slug: "code-review",
			name: "Code Review!",
			description: "",
			briefing: "",
			version: 1,
			createdAt: NOW.toISOString(),
		});
		expect(first.id).toMatch(ULID);
		expect((await createFlow("Code review")).slug).toBe("code-review-2");
		expect(eventsOfType(h.flushed, "flows.changed")).toHaveLength(2);
	});

	test("create refuses a slug the caller sends when another flow holds it", async () => {
		await createFlow("Review");
		const data = await expectErrorData(
			h.run((ctx, tx) => flows.create(ctx, tx, { name: "Other", slug: "review" })),
			"DUPLICATE",
		);
		expect(data).toEqual({ field: "slug" });
	});

	test("get reads a flow by slug and by id, and an unknown ref is NOT_FOUND", async () => {
		const flow = await createFlow();
		const bySlug = await h.run((ctx, tx) => flows.get(ctx, tx, { flow: "REVIEW" }));
		const byId = await h.run((ctx, tx) => flows.get(ctx, tx, { flow: flow.id.toLowerCase() }));
		expect(bySlug).toEqual({ flow, nodes: [], edges: [] });
		expect(byId).toEqual(bySlug);
		const data = await expectErrorData(
			h.run((ctx, tx) => flows.get(ctx, tx, { flow: "ghost" })),
			"NOT_FOUND",
		);
		expect(data).toEqual({ kind: "flow", ref: "ghost" });
	});

	test("save stores a graph with a group, a gate, and a fan-in, and raises the version", async () => {
		const flow = await createFlow();
		const gate = node({ kind: "gate", title: "Backend?", instruction: "Does it touch the server?" });
		const box = node({ kind: "group", title: "Checks", instruction: "", minutes: 12, width: 480, height: 240 });
		// The child comes before its group in the input.
		const inner = node({ parentId: box.id, title: "Migrations", x: 12.5, y: -4 });
		const report = node({ title: "Report" });
		const edges = [
			{ id: ulid(), fromNodeId: gate.id, toNodeId: box.id, branch: "yes" as const },
			{ id: ulid(), fromNodeId: gate.id, toNodeId: report.id, branch: "no" as const },
			{ id: ulid(), fromNodeId: box.id, toNodeId: report.id, branch: "out" as const },
		];
		const doc = await saveGraph({ flow: flow.slug, nodes: [inner, gate, box, report], edges, expectedVersion: 1 });
		expect(doc.flow.version).toBe(2);
		expect(doc.nodes).toHaveLength(4);
		expect(doc.nodes.find((row) => row.id === inner.id)).toEqual(inner);
		expect(doc.edges).toEqual(expect.arrayContaining(edges));
		expect(await h.run((ctx, tx) => flows.get(ctx, tx, { flow: flow.id }))).toEqual(doc);
		const [summary] = await h.run((ctx, tx) => flows.list(ctx, tx, {}));
		expect(summary).toMatchObject({ id: flow.id, nodeCount: 4, edgeCount: 3, version: 2 });
	});

	test("a save replaces the graph, so a node the input omits is gone with its edges", async () => {
		const flow = await createFlow();
		const a = node({ title: "A" });
		const b = node({ title: "B" });
		await saveGraph({
			flow: flow.id,
			nodes: [a, b],
			edges: [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" }],
		});
		const renamed = { ...a, title: "A2" };
		const doc = await saveGraph({ flow: flow.id, nodes: [renamed], edges: [] });
		expect(doc.nodes).toEqual([renamed]);
		expect(doc.edges).toEqual([]);
		expect(await h.rows(sql`SELECT id FROM flow_edges`)).toEqual([]);
	});

	test("a save with an old version is FLOW_VERSION_CONFLICT and writes nothing", async () => {
		const flow = await createFlow();
		await saveGraph({ flow: flow.id, nodes: [node()], edges: [], expectedVersion: 1 });
		const data = await expectErrorData(
			saveGraph({ flow: flow.id, nodes: [], edges: [], expectedVersion: 1 }),
			"FLOW_VERSION_CONFLICT",
		);
		expect(data).toEqual({ version: 2 });
		expect(await h.rows(sql`SELECT id FROM flow_nodes`)).toHaveLength(1);
	});

	test("a graph with a loop of edges is INPUT_VALIDATION_FAILED at the edge that closes it", async () => {
		const flow = await createFlow();
		const a = node();
		const b = node();
		const edges = [
			{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" as const },
			{ id: ulid(), fromNodeId: b.id, toNodeId: a.id, branch: "out" as const },
		];
		const data = await expectErrorData(saveGraph({ flow: flow.id, nodes: [a, b], edges }), "INPUT_VALIDATION_FAILED");
		expect(data.issues).toEqual([expect.objectContaining({ code: "cycle", path: ["edges", 1] })]);
		expect(await h.rows(sql`SELECT id FROM flow_nodes`)).toEqual([]);
	});

	test("a node that names an unknown persona is INPUT_VALIDATION_FAILED on its personaId", async () => {
		const flow = await createFlow();
		const data = await expectErrorData(
			saveGraph({ flow: flow.id, nodes: [node({ personaId: ulid() })], edges: [] }),
			"INPUT_VALIDATION_FAILED",
		);
		expect(data.issues).toEqual([{ message: "The persona does not exist.", path: ["nodes", 0, "personaId"] }]);
	});

	test("a node id that another flow holds is DUPLICATE", async () => {
		const first = await createFlow("First");
		const second = await createFlow("Second");
		const shared = node();
		await saveGraph({ flow: first.id, nodes: [shared], edges: [] });
		const data = await expectErrorData(saveGraph({ flow: second.id, nodes: [shared], edges: [] }), "DUPLICATE");
		expect(data).toEqual({ field: "id" });
	});

	test("a persona delete keeps the node and clears its persona", async () => {
		const persona = await h.run((ctx, tx) => personas.create(ctx, tx, { name: "Reviewer", instruction: "Review." }));
		const flow = await createFlow();
		const step = node({ personaId: persona.id, instruction: "" });
		await saveGraph({ flow: flow.id, nodes: [step], edges: [] });
		await h.run((ctx, tx) => personas.remove(ctx, tx, { id: persona.id }));
		const doc = await h.run((ctx, tx) => flows.get(ctx, tx, { flow: flow.id }));
		expect(doc.nodes).toEqual([{ ...step, personaId: null }]);
	});

	test("update changes the briefing and the slug, and checks the version", async () => {
		const flow = await createFlow();
		const changed = await h.run(
			(ctx, tx) =>
				flows.update(ctx, tx, { flow: flow.id, slug: "pr-review", briefing: "Read {TARGET}.", expectedVersion: 1 }),
			{ now: secondsAfter(30) },
		);
		expect(changed).toMatchObject({ slug: "pr-review", briefing: "Read {TARGET}.", name: "Review", version: 2 });
		expect(changed.updatedAt).toBe(secondsAfter(30).toISOString());
		await expectErrorData(
			h.run((ctx, tx) => flows.update(ctx, tx, { flow: flow.id, name: "Late", expectedVersion: 1 })),
			"FLOW_VERSION_CONFLICT",
		);
	});

	test("delete removes the flow with its nodes and edges", async () => {
		const flow = await createFlow();
		const a = node();
		const b = node();
		await saveGraph({
			flow: flow.id,
			nodes: [a, b],
			edges: [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" }],
		});
		expect(await h.run((ctx, tx) => flows.remove(ctx, tx, { flow: flow.slug }))).toEqual({ id: flow.id });
		expect(await h.rows(sql`SELECT id FROM flow_nodes UNION ALL SELECT id FROM flow_edges`)).toEqual([]);
		expect(await h.run((ctx, tx) => flows.list(ctx, tx, {}))).toEqual([]);
	});
});
