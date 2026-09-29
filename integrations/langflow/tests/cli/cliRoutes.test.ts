import { afterAll, beforeAll, expect, test } from "bun:test";
import { RPCHandler } from "@orpc/server/fetch";
import { sql } from "drizzle-orm";
import { reviewFixture } from "../../../../apps/server/src/db/queries/reviewReady.fixtures.ts";
import type { ServiceTransport } from "../../../../apps/server/src/db/transport.ts";
import type { GhAccess } from "../../../../apps/server/src/ghState.ts";
import { type ProcedureContext, router } from "../../../../apps/server/src/procedures/index.ts";
import { createDbTiming } from "../../../../apps/server/src/serverTiming.ts";
import { services } from "../../../../apps/server/src/services/registry.ts";
import { fixture as cliFixture } from "../../../../packages/cli/src/commands/flow/testFixture/testFixture.ts";
import { run } from "../../../../packages/cli/src/index.ts";
import { fixture } from "./fixture/fixture.ts";

let h: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
	h = await fixture();
}, 60_000);
afterAll(async () => {
	await h.db.$client.close();
});
const handler = new RPCHandler<ProcedureContext>(router);
const command = async (args: string[]) => {
	const cli = cliFixture(() => {
		throw new Error("Unexpected mock transport");
	});
	const calls: string[] = [];
	cli.deps.fetch = async (raw) => {
		const call: ServiceTransport["call"] = (name, ctx, input) => {
			calls.push(name);
			const entry = services[name];
			if (entry.family !== "core") throw new Error(`Expected core service: ${name}`);
			return h.db.transaction((tx) => entry.run({ ...h.ctx, ...ctx }, tx, input));
		};
		const result = await handler.handle(raw, {
			prefix: "/rpc",
			context: {
				headers: raw.headers,
				reqId: "cli-acceptance",
				actor: null,
				transport: { call } as ServiceTransport,
				timing: createDbTiming(),
				chooseDirectory: async () => null,
				gh: {} as GhAccess,
			},
		});
		expect(result.matched).toBe(true);
		const response = result.response!;
		response.headers.set("x-trellis-api-version", "1");
		return response;
	};
	const code = await run([...args, "--json"], cli.deps);
	return { ...cli, code, services: calls };
};

test("CLI reads the registered document route and both stored execution formats", async () => {
	const document = await command(["flow", "document", "show", h.flow]);
	expect(document.errors()).toBe("");
	expect(document.code).toBe(0);
	expect(JSON.parse(document.text())).toMatchObject({ schemaVersion: 1, engine: "langflow" });
	for (const [id, engine] of [
		[h.legacy.id, "legacy"],
		[h.view.id, "langflow"],
	] as const) {
		const result = await command(["flow", "run", "show", id]);
		expect(result.errors()).toBe("");
		expect(result.code).toBe(0);
		const record = JSON.parse(result.text());
		expect(record.id).toBe(id);
		if (engine === "legacy") {
			expect(record.state.status).toBe("running");
			expect(record).not.toHaveProperty("schemaVersion");
		} else expect(record).toMatchObject({ schemaVersion: 1, engine, status: h.view.status });
		expect(result.services).toContain("flowDocuments.view");
	}
});

test("CLI follows all pages of the registered index with both stores", async () => {
	await h.db.execute(sql`INSERT INTO flow_executions
		(id,flow_id,ticket_id,project_id,diff_id,actor_kind,actor_name,request_id,request,revision,head_sha,doc,state,created_at,updated_at)
		SELECT lpad(n::text, 26, '0'), flow_id, ticket_id, project_id, diff_id,
			actor_kind, actor_name, md5(n::text)::uuid::text, request, revision, head_sha, doc, state, created_at, updated_at
		FROM flow_executions CROSS JOIN generate_series(100,600) AS n
		WHERE id = ${h.legacy.id}`);
	const result = await command(["flow", "run", "list"]);
	expect(result.errors()).toBe("");
	expect(result.code).toBe(0);
	const records = JSON.parse(result.text()) as Array<{ id: string; engine?: string }>;
	expect(records).toHaveLength(503);
	expect(new Set(records.map(({ id }) => id)).size).toBe(503);
	expect(records.find(({ id }) => id === h.view.id)!.engine).toBe("langflow");
	expect(result.services.filter((name) => name === "flowDocuments.list")).toHaveLength(2);
}, 60_000);

test("registered routes preserve flow, ticket and diff filters", async () => {
	const other = await reviewFixture(h.db);
	const excluded = await other.insertRun("langflow", "running");
	for (const flags of [
		["--flow", h.flow],
		["--ticket", h.ticket],
		["--diff", h.pull],
	]) {
		const result = await command(["flow", "run", "list", ...flags]);
		expect(result.errors()).toBe("");
		expect(result.code).toBe(0);
		const records = JSON.parse(result.text()) as Array<{ id: string }>;
		expect(records.some(({ id }) => id === h.view.id)).toBe(true);
		expect(records.some(({ id }) => id === h.legacy.id)).toBe(true);
		expect(records.some(({ id }) => id === excluded.id)).toBe(false);
	}
}, 60_000);
