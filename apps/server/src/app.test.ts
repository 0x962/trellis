import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type AnyContractRouter, isContractProcedure } from "@orpc/contract";
import { contract } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { CLAUDE, createTestApp, type TestApp } from "../test/helpers/app.ts";
import { freshDb, type TestDb } from "../test/helpers/db.ts";

// The Hono app: the request id, the logger, cors for the two dev origins, the
// body limit on the upload paths, the RPC handler at /rpc and the OpenAPI
// handler at /api over one router, the actor middleware on every mutation,
// and the plain routes. The SPA fallback never answers under /api or /rpc.

let h: TestDb;
let t: TestApp;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	t = await createTestApp({ db: h, maxUploadMb: 1 });
	await t.seedProject("CDE");
});
afterAll(() => h.close());

const MB = 1024 * 1024;

const multipart = (bytes: number) => {
	const form = new FormData();
	form.set("file", new File([new Uint8Array(bytes)], "big.bin", { type: "application/octet-stream" }));
	return form;
};

type Route = { name: string; method: string; path: string };

const routes = (router: AnyContractRouter, prefix: string[] = []): Route[] => {
	if (isContractProcedure(router)) {
		const { route } = router["~orpc"];
		return [{ name: prefix.join("."), method: route.method ?? "POST", path: route.path ?? "" }];
	}
	return Object.entries(router).flatMap(([key, child]) => routes(child as AnyContractRouter, [...prefix, key]));
};

const fill = (path: string) =>
	path.replace("{project}", "CDE").replace("{ticket}", "CDE-1").replace("{status}", "todo").replace("{id}", ulid());

describe("request id and cors", () => {
	test("the request id header matches the logged request id", async () => {
		const response = await t.api("/api/health");

		const reqId = response.headers.get("x-request-id");
		expect(reqId).toMatch(/\S+/);
		const line = t.records.find((entry) => entry.msg === "request" && entry.path === "/api/health");
		expect(line?.reqId).toBe(reqId);
	});

	test("cors allows the two development origins", async () => {
		for (const origin of ["http://localhost:5173", "http://trellis.localhost"]) {
			const response = await t.api("/api/health", { headers: { origin } });
			expect(response.headers.get("access-control-allow-origin"), origin).toBe(origin);
		}
	});

	test("a request whose Host names another site answers 403 on a read and on a write", async () => {
		const headers = { host: "attacker.example:4521" };

		const read = await t.api("/api/tickets", { headers });
		const write = await t.api("/api/tickets", { method: "POST", body: { project: "CDE", title: "Rebound" }, headers });
		const rpc = await t.app.request("http://trellis.test/rpc/system/health", { method: "POST", headers });

		expect(read.status).toBe(403);
		expect(write.status).toBe(403);
		expect(rpc.status).toBe(403);
		expect((await t.api("/api/tickets", { headers: { host: "127.0.0.1:4521" } })).body.items).toHaveLength(0);
	});

	test("a request whose Host is a loopback name, a .localhost name, or an address is served", async () => {
		const hosts = ["127.0.0.1:4521", "localhost:4521", "[::1]:4521", "trellis.localhost", "192.168.1.20:4521"];
		for (const host of hosts) {
			const response = await t.api("/api/tickets", { headers: { host } });

			expect(response.status, host).toBe(200);
		}
	});

	// Tailscale Serve proxies its ts.net hostname to 127.0.0.1 and keeps that
	// hostname in the Host header.
	test("a Host in TRELLIS_ALLOWED_HOSTS is served, and a Host not in it answers 403", async () => {
		const proxied = await createTestApp({ db: h, allowedHosts: "my-laptop.tail1a2b3c.ts.net" });

		const allowed = await proxied.api("/api/tickets", { headers: { host: "my-laptop.tail1a2b3c.ts.net" } });
		const refused = await proxied.api("/api/tickets", { headers: { host: "other.tail4a5b4c.ts.net" } });
		await proxied.close();

		expect(allowed.status).toBe(200);
		expect(refused.status).toBe(403);
	});

	test("the 403 message names TRELLIS_ALLOWED_HOSTS as the way to allow a proxy hostname", async () => {
		const response = await t.api("/api/tickets", { headers: { host: "attacker.example" } });

		expect(response.status).toBe(403);
		expect(response.body.message).toContain("TRELLIS_ALLOWED_HOSTS");
	});

	test("cors refuses an unknown origin", async () => {
		const response = await t.api("/api/health", { headers: { origin: "https://evil.example" } });

		expect(response.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
		expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
	});
});

describe("body limit", () => {
	test("the body limit rejects an upload over the configured size", async () => {
		await t.createTicket({ project: "CDE", title: "Holder" });

		const response = await t.api("/api/tickets/CDE-1/attachments", { method: "POST", raw: multipart(2 * MB) });

		expect(response.status).toBe(413);
		expect(response.body.code).toBe("PAYLOAD_TOO_LARGE");
		expect(response.body.data.maxBytes).toBe(1 * MB);
	});

	test("the body limit applies to the upload paths only", async () => {
		const description = "d".repeat(2 * MB);

		const response = await t.api("/api/tickets", {
			method: "POST",
			body: { project: "CDE", title: "Big", description },
		});

		expect(response.status).toBe(201);
		expect(response.body.description).toHaveLength(2 * MB);
	});
});

describe("handlers", () => {
	test("the RPC handler serves the contract at /rpc", async () => {
		const ticket = await t.client.tickets.create({ project: "CDE", title: "Over RPC" });

		expect(ticket.identifier).toBe("CDE-1");
		expect(ticket.title).toBe("Over RPC");
		expect(ticket.project.key).toBe("CDE");
	});

	test("the OpenAPI handler serves the contract at /api", async () => {
		const response = await t.api("/api/tickets", { method: "POST", body: { project: "CDE", title: "Over curl" } });

		expect(response.status).toBe(201);
		expect(response.body.identifier).toBe("CDE-1");
		expect(response.body.title).toBe("Over curl");
	});

	test("every response carries the api version header", async () => {
		const health = await t.api("/api/health");
		const missing = await t.api("/api/nope");
		const rpc = await t.app.request("http://trellis.test/rpc/system/health", { method: "POST" });

		for (const headers of [health.headers, missing.headers, rpc.headers]) {
			expect(headers.get("x-trellis-api-version")).toBe(health.body.apiVersion);
		}
		expect(health.body.apiVersion).toMatch(/\S+/);
	});

	test("an unknown api path answers 404 and never falls through to the SPA", async () => {
		const response = await t.api("/api/nope");

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toContain("json");
		expect(typeof response.body).toBe("object");
		expect(JSON.stringify(response.body)).not.toContain("<html");
	});

	test("the RPC route and the OpenAPI route return the same body", async () => {
		const overRpc = await t.client.projects.get({ project: "CDE" });
		const overApi = await t.api("/api/projects/CDE");

		expect(overApi.status).toBe(200);
		expect(overApi.body).toEqual(overRpc);
	});
});

describe("actor header", () => {
	test("a mutation without the actor header answers ACTOR_REQUIRED", async () => {
		const response = await t.api("/api/tickets", { method: "POST", body: { project: "CDE", title: "x" }, actor: null });

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("ACTOR_REQUIRED");
		expect(response.body.message).toContain("x-trellis-actor");
	});

	test("a malformed actor header answers ACTOR_INVALID with the grammar", async () => {
		const response = await t.api("/api/tickets", {
			method: "POST",
			body: { project: "CDE", title: "x" },
			actor: "claude-code",
		});

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("ACTOR_INVALID");
		expect(response.body.data.grammar).toContain("x-trellis-actor");
	});

	test("the actor header refuses the system kind", async () => {
		const response = await t.api("/api/tickets", {
			method: "POST",
			body: { project: "CDE", title: "x" },
			actor: "system:trellis",
		});

		expect(response.status).toBe(400);
		expect(response.body.code).toBe("ACTOR_INVALID");
	});

	test("a GET works without the actor header", async () => {
		const response = await t.api("/api/tickets", { actor: null });

		expect(response.status).toBe(200);
		expect(response.body.items).toEqual([]);
	});

	test("a GET ignores a malformed actor header", async () => {
		const response = await t.api("/api/tickets", { actor: "not an actor" });

		expect(response.status).toBe(200);
		expect(response.body.items).toEqual([]);
	});

	test("requireActor upserts the actor row before the service runs", async () => {
		const response = await t.api("/api/tickets", {
			method: "POST",
			body: { project: "CDE", title: "By an agent" },
			actor: CLAUDE,
		});

		expect(response.status).toBe(201);
		expect(response.body.lastActor).toMatchObject({ name: "claude-code", kind: "agent" });
		const found = await h.db.execute(sql`SELECT name, kind FROM actors WHERE kind = 'agent'`);
		expect(found.rows).toEqual([{ name: "claude-code", kind: "agent" }]);
	});

	test("the session header reaches activity meta", async () => {
		const response = await t.api("/api/tickets", {
			method: "POST",
			body: { project: "CDE", title: "With a session" },
			headers: { "x-trellis-session": "abc" },
		});

		expect(response.status).toBe(201);
		const found = await h.db.execute(
			sql`SELECT meta FROM activity WHERE ticket_id = ${response.body.id} AND action = 'ticket.created'`,
		);
		expect(found.rows).toHaveLength(1);
		expect((found.rows[0]!.meta as { session?: string }).session).toBe("abc");
	});

	test("every mutating procedure requires the actor header", async () => {
		const mutations = routes(contract).filter((route) => route.method !== "GET");
		expect(mutations.length).toBeGreaterThanOrEqual(25);

		for (const route of mutations) {
			const response = await t.api(`/api${fill(route.path)}`, { method: route.method, body: {}, actor: null });
			expect([route.name, response.status, response.body.code]).toEqual([route.name, 400, "ACTOR_REQUIRED"]);
		}
	});
});
