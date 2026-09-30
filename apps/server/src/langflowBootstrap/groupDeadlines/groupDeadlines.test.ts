import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type AppOptions, createApp } from "../../app";
import { loadConfig } from "../../config";
import type { ServiceTransport } from "../../db/transport";
import { createBus } from "../../events/bus";
import { createGhRunner } from "../../gh/run";
import { supervisorFixture } from "../../langflowHost/fixtures/supervisorFixture";
import { PrivateState } from "../../langflowHost/privateState";
import { createLogger } from "../../log";
import type { GroupDeadlineRequest, GroupDeadlineResult, GroupDeadlineScope } from "../../services/langflowClocks";
import { groupDeadlines } from "./groupDeadlines";

const path = "http://localhost/api/langflow-private/v1/group-deadlines";
const input: GroupDeadlineRequest = {
	executionId: "execution",
	publicationId: "publication",
	engineJobId: "00000000-0000-4000-8000-000000000001",
	engineEpoch: 1,
	scopeVertexId: "scope",
	occurrenceKey: "root-group",
};
const proof: Omit<GroupDeadlineScope, "occurrenceKey"> = {
	executionId: input.executionId,
	publicationId: input.publicationId,
	engineJobId: input.engineJobId,
	engineEpoch: input.engineEpoch,
	scopeVertexId: input.scopeVertexId,
	groupDefinition: { version: 1, groupNodeId: "group", minutes: 2, scopeVertexId: "scope" },
	occurrence: {
		nodeId: "group",
		occurrenceKey: input.occurrenceKey,
		parentOccurrenceKey: null,
		phase: "step",
		iterationPath: [],
	},
	scope: {
		parentOccurrenceKey: null,
		phase: "step",
		iterationPath: [],
		inputReceiptIds: [],
		groupDeadlineRefs: [],
		deadlineAt: null,
	},
};
const result: GroupDeadlineResult = {
	deadline: {
		deadlineId: "saved-deadline",
		groupOccurrenceKey: input.occurrenceKey,
		budgetMs: 120_000,
		launchedAt: null,
		deadlineAt: null,
		launchReceiptId: null,
	},
	groupDeadlineRefs: ["saved-deadline"],
	deadlineAt: null,
};

function appFixture(handler?: AppOptions["groupDeadlines"]) {
	return createApp({
		config: loadConfig({ TRELLIS_AUTH_TOKEN: "host-token" }),
		transport: {
			start: async () => {
				throw new Error("Unexpected start");
			},
			close: async () => {},
			call: async () => {
				throw new Error("Unexpected public service call");
			},
		},
		bus: createBus({ bootId: "deadline-route" }),
		log: createLogger({ level: "error", env: {}, sink: { isTTY: false, write: () => {} } }),
		runtime: {
			version: "test",
			bootId: "deadline-route",
			gh: createGhRunner(),
			addresses: async () => [],
			ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
		},
		groupDeadlines: handler,
	}).app;
}

test("the deadline mount retains the Host guard and requires explicit composition", async () => {
	let called = false;
	const mounted = appFixture(async () => {
		called = true;
		return Response.json(result);
	});
	const refused = await mounted.request(path, { method: "POST", headers: { host: "foreign.invalid" } });
	expect(refused.status).toBe(403);
	expect(called).toBe(false);
	const absent = await appFixture().request(path, {
		method: "POST",
		headers: { authorization: "Bearer host-token" },
	});
	expect(absent.status).toBe(404);
});

test("the mounted callback uses the observed engine and awaits its worker before shutdown", async () => {
	const f = await supervisorFixture();
	const supervisor = await f.open();
	const release = Promise.withResolvers<void>();
	let connection: ReturnType<typeof groupDeadlines> | undefined;
	try {
		const live = await supervisor.start();
		const state = await PrivateState.open(f.home);
		const token = await state.nativeReservationAuthentication(live.identity);
		const authorization = `Bearer ${await readFile(token.nativeReservationAuthenticationFile, "utf8")}`;
		const entered = Promise.withResolvers<void>();
		let engineReads = 0;
		const transport: ServiceTransport = {
			start: async () => {
				throw new Error("Unexpected start");
			},
			close: async () => {},
			call: async (name, context, value) => {
				expect(name).toBe("langflowClocks.reserveGroupDeadline");
				expect(context.actor?.kind).toBe("system");
				expect(value).toMatchObject({
					request: { ...proof, occurrenceKey: input.occurrenceKey },
					capabilityId: "grant",
					observation: { identity: live.identity },
				});
				entered.resolve();
				await release.promise;
				return result;
			},
		};
		connection = groupDeadlines({
			home: f.home,
			transport,
			supervisor,
			engineDependencies: {
				readAuthenticationFile: async (file) => {
					expect(file).toBe(join(f.home, "langflow", "secrets", `${live.identity.instanceId}.token`));
					return "incoming-token";
				},
				fetch: async (url, init) => {
					engineReads++;
					expect(String(url)).toBe(new URL("/trellis-v1/group-scopes/read", live.endpoint).href);
					expect(new Headers(init?.headers).get("authorization")).toBe("Bearer incoming-token");
					expect(new Headers(init?.headers).get("x-trellis-capability-id")).toBe("grant");
					expect(JSON.parse(String(init?.body))).toEqual(input);
					return Response.json(proof);
				},
			},
		});
		const app = appFixture(connection.handle);
		const invalid = await app.request(path, {
			method: "POST",
			headers: { authorization: "Bearer host-token" },
		});
		expect(invalid.status).toBe(401);
		expect(engineReads).toBe(0);
		const pending = app.request(path, {
			method: "POST",
			headers: { authorization, "x-trellis-capability-id": "grant" },
			body: JSON.stringify(input),
		});
		await entered.promise;
		let stopped = false;
		const closing = connection.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release.resolve();
		const response = await pending;
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
		await closing;
		expect(stopped).toBe(true);
		expect(engineReads).toBe(1);
		await expect(connection.handle(new Request(path, { method: "POST" }))).rejects.toThrow("langflow_runtime_stopping");
	} finally {
		release.resolve();
		await connection?.stop();
		await supervisor.shutdown();
		await f.remove();
	}
});
