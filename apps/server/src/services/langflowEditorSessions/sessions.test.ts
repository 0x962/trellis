import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EditorBootstrapSchema } from "../../../../../integrations/langflow/editor/session";
import { editorFixture } from "./fixture";

describe("restricted editor HTTP handlers", () => {
	let fixture: Awaited<ReturnType<typeof editorFixture>>;
	beforeAll(async () => {
		fixture = await editorFixture();
	});
	afterAll(async () => {
		await fixture.db.$client.close();
	});

	test("authenticates issue with the host token and exact parent origin", async () => {
		const f = await fixture.setup();
		expect((await f.issue({ authorization: "Bearer wrong" })).status).toBe(401);
		expect((await f.issue({ origin: f.options.editorOrigin })).status).toBe(403);
		expect((await f.issue({ "x-trellis-actor": "human:browser-name" })).status).toBe(201);
		expect(
			(
				await f.issue(
					{},
					{ flow: f.session.identity.flowId, expectedVersion: f.session.identity.revision, actor: "browser-name" },
				)
			).status,
		).toBe(400);
		expect(f.session.identity.actor).toBe("human:test");
		expect(JSON.stringify(f.session)).not.toContain(f.options.hostToken);
		expect(f.cookie).toContain("HttpOnly");
		expect(f.cookie).toContain("SameSite=Strict");
		expect(f.cookie).toContain(`/api/trellis-editor/v1/sessions/${f.session.channel}`);
		expect(f.cookie).not.toContain("Domain=");
	});

	test("supplies the shared bootstrap from cookie authority without browser identities", async () => {
		const f = await fixture.setup();
		const response = await f.request("session", "GET", undefined, {
			"x-trellis-editor-identity": "",
			"x-trellis-editor-project": "",
		});
		expect(response.status).toBe(200);
		const bootstrap = EditorBootstrapSchema.parse(await response.json());
		expect(bootstrap.identity).toEqual(f.session.identity);
		expect(bootstrap.parentOrigin).toBe(f.options.parentOrigin);
		expect((await f.request("session", "GET", undefined, { cookie: "" })).status).toBe(401);
		expect((await f.request("session", "GET", undefined, { origin: "https://foreign.test" })).status).toBe(403);
		expect((await f.request("session", "GET", undefined, {}, "http://localhost:4522")).status).toBe(403);
	});

	test("refuses actor, host, flow, revision, project, and manifest changes", async () => {
		const f = await fixture.setup();
		for (const change of [
			{ actor: "human:other" },
			{ host: "other-host" },
			{ flowId: "other-flow" },
			{ revision: f.session.identity.revision + 1 },
			{ documentHash: "a".repeat(64) },
			{ componentManifestHash: "b".repeat(64) },
		]) {
			const response = await f.request("document", "GET", undefined, {
				"x-trellis-editor-identity": JSON.stringify({ ...f.session.identity, ...change }),
			});
			expect(response.status).toBeGreaterThanOrEqual(400);
		}
		expect((await f.request("document", "GET", undefined, { "x-trellis-editor-project": "OTHER" })).status).toBe(403);
		expect((await f.request("document")).status).toBe(200);
		f.setActor("different-owner");
		expect((await f.request("document")).status).toBe(403);
	});

	test("denies all direct operations outside the read and save allowlist", async () => {
		const f = await fixture.setup();
		for (const operation of [
			"run",
			"playground",
			"share",
			"python",
			"import",
			"variables",
			"provider-key",
			"component",
			"decision",
		]) {
			expect((await f.request(operation, "POST", "{}")).status).toBe(403);
		}
		expect((await f.server.fetch(new Request(`${f.options.editorOrigin}/api/v1/run/flow`))).status).toBe(403);
		expect((await f.request("component-manifest")).status).toBe(200);
		const input = { ...f.input(), graphDocument: { substitute: true } };
		expect((await f.request("document", "PUT", JSON.stringify(input))).status).toBe(403);
		expect(f.writes()).toBe(0);
	});

	test("replays exact lost-response bytes and advances CAS without changing the bootstrap identity", async () => {
		const f = await fixture.setup();
		const input = f.input();
		const bytes = JSON.stringify(input);
		const first = await f.request("document", "PUT", bytes);
		expect(first.status).toBe(200);
		const firstBytes = await first.text();
		const retry = await f.request("document", "PUT", bytes);
		expect(retry.status).toBe(200);
		expect(await retry.text()).toBe(firstBytes);
		expect(f.writes()).toBe(1);
		expect((await f.request("document", "PUT", `${bytes}\n`)).status).toBe(409);
		const next = await f.request("document", "PUT", JSON.stringify(f.input(JSON.parse(firstBytes).revision)));
		expect(next.status).toBe(200);
		expect(f.writes()).toBe(2);
		const bootstrap = await (await f.request("session")).json();
		expect(bootstrap.identity).toEqual(f.session.identity);
	});

	test("checks revocation, expiry, and manifest replacement before receipt replay", async () => {
		for (const change of ["revoke", "expire", "manifest"] as const) {
			const f = await fixture.setup();
			const bytes = JSON.stringify(f.input());
			expect((await f.request("document", "PUT", bytes)).status).toBe(200);
			if (change === "revoke") expect((await f.request("grant", "DELETE")).status).toBe(200);
			if (change === "expire") f.setTime("2026-09-29T09:00:00Z");
			if (change === "manifest") f.setManifest("e".repeat(64));
			expect((await f.request("document", "PUT", bytes)).status).toBe(403);
			expect(f.writes()).toBe(1);
		}
	});

	test("keeps a conflict blocked after an external document save", async () => {
		const f = await fixture.setup();
		const input = f.input();
		const receipt = await f.options.documents.save(fixture.ctx.actor!, {
			document: input,
			projectId: f.current.projectId,
		});
		expect((await f.request("document", "PUT", JSON.stringify(f.input()))).status).toBe(412);
		expect((await f.request("document", "PUT", JSON.stringify(f.input(receipt.revision)))).status).toBe(412);
		expect(f.writes()).toBe(1);
	});
});
