import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cookieName, sessionPath, tokenHash } from "./authorization";
import { editorFailure } from "./failure";
import { editorFixture } from "./fixture";
import { issueSession } from "./issueSession";
import type { EditorGrant } from "./types";

describe("editor session issuance", () => {
	let fixture: Awaited<ReturnType<typeof editorFixture>>;
	beforeAll(async () => {
		fixture = await editorFixture();
	});
	afterAll(async () => {
		await fixture.db.$client.close();
	});

	test("returns the saved session and a private credential for the shared HTTP grant", async () => {
		const f = await fixture.setup();
		const { session, credential } = await f.server.issue({
			flow: f.current.document.flow.id,
			expectedVersion: f.current.document.revision,
		});
		expect(session.channel).not.toBe(f.session.channel);
		expect(session.identity).toEqual(f.session.identity);
		expect(session.content).toEqual({
			schemaVersion: 1,
			engine: "langflow",
			graphDocument: f.current.document.graphDocument,
			componentManifestHash: f.current.document.componentManifestHash,
		});
		expect(credential.expiresAt).toEqual(f.options.expiresAt(f.options.now()));
		expect(session.expiresAt).toBe(credential.expiresAt.toISOString());
		expect(JSON.stringify(session)).not.toContain(credential.token);
		expect(JSON.stringify(session)).not.toContain(f.options.hostToken);
		const response = await f.server.fetch(
			new Request(`${f.options.parentOrigin}${sessionPath(session.channel)}/grant`, {
				headers: {
					cookie: `${cookieName}=${credential.token}`,
					origin: f.options.editorOrigin,
					"x-trellis-editor-identity": JSON.stringify(session.identity),
					"x-trellis-editor-project": f.current.document.flow.project ?? "",
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(session);
	});

	test.each([
		["ACTOR_MISMATCH", 403],
		["FLOW_UNSUPPORTED_FORMAT", 409],
		["FLOW_VERSION_CONFLICT", 412],
		["MANIFEST_MISMATCH", 403],
		["COMPONENT_SUBSTITUTION", 403],
		["FLOW_NOT_FOUND", 404],
	] as const)("keeps %s and its status without a grant or cookie", async (code, status) => {
		const f = await fixture.setup();
		const input = { flow: f.current.document.flow.id, expectedVersion: f.current.document.revision };
		const manifest = await f.options.installedManifest();
		if (code === "ACTOR_MISMATCH") f.options.actor = async () => ({ kind: "agent", name: "fixture" });
		if (code === "FLOW_UNSUPPORTED_FORMAT")
			f.options.documents.get = async () => ({
				...f.current,
				document: {
					...f.current.document,
					engine: "legacy",
					componentManifestHash: null,
					graphDocument: { nodes: [], edges: [] },
				},
			});
		if (code === "FLOW_VERSION_CONFLICT") input.expectedVersion += 1;
		if (code === "MANIFEST_MISMATCH") f.options.installedManifest = async () => ({ ...manifest, hash: "e".repeat(64) });
		if (code === "COMPONENT_SUBSTITUTION")
			f.options.installedManifest = async () => ({
				...manifest,
				assertContent: async () => {
					throw editorFailure(code);
				},
			});
		if (code === "FLOW_NOT_FOUND")
			f.options.documents.get = async () => {
				throw editorFailure(code, status);
			};
		const grants = new Map<string, EditorGrant>();
		await expect(issueSession(grants, f.options, input)).rejects.toMatchObject({ code, status });
		expect(grants.size).toBe(0);
		await expect(f.server.issue(input)).rejects.toMatchObject({ code, status });
		const response = await f.issue({}, input);
		expect(response.status).toBe(status);
		expect(await response.json()).toMatchObject({ code, status });
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	test("stores only the token hash and the actual project with the grant", async () => {
		const f = await fixture.setup();
		const grants = new Map<string, EditorGrant>();
		const result = await issueSession(grants, f.options, {
			flow: f.current.document.flow.id,
			expectedVersion: f.current.document.revision,
		});
		const grant = grants.get(result.session.channel)!;
		expect(grant.tokenHash).toBe(tokenHash(result.credential.token));
		expect(JSON.stringify(grant)).not.toContain(result.credential.token);
		expect(grant.projectId).toBe(f.current.projectId);
		expect(grant.project).toBe(f.current.document.flow.project);
		expect(grant.actor).toEqual(await f.options.actor());
	});

	test("rejects an invalid or elapsed expiry before it stores a grant", async () => {
		const f = await fixture.setup();
		for (const expiry of [new Date("invalid"), f.options.now(), new Date("2026-09-29T08:00:00Z")]) {
			f.options.expiresAt = () => expiry;
			const grants = new Map<string, EditorGrant>();
			const input = { flow: f.current.document.flow.id, expectedVersion: f.current.document.revision };
			await expect(issueSession(grants, f.options, input)).rejects.toThrow(
				"The editor policy must supply a future expiry.",
			);
			expect(grants.size).toBe(0);
			await expect(f.server.issue(input)).rejects.toThrow("The editor policy must supply a future expiry.");
		}
	});

	test("checks HTTP authentication and input before it calls the actor provider", async () => {
		const f = await fixture.setup();
		let calls = 0;
		f.options.actor = async () => {
			calls += 1;
			return { kind: "human", name: "test" };
		};
		for (const [headers, status] of [
			[{ authorization: "" }, 401],
			[{ origin: "" }, 403],
			[{ origin: f.options.editorOrigin }, 403],
		] as const) {
			const response = await f.issue(headers);
			expect(response.status).toBe(status);
			expect(response.headers.get("set-cookie")).toBeNull();
		}
		expect((await f.issue({}, { flow: "review", expectedVersion: 0 })).status).toBe(400);
		const wrongHost = await f.server.fetch(
			new Request(`${f.options.editorOrigin}/api/trellis-editor/v1/sessions`, {
				method: "POST",
				headers: { authorization: `Bearer ${f.options.hostToken}`, origin: f.options.editorOrigin },
			}),
		);
		expect(wrongHost.status).toBe(403);
		expect(await wrongHost.json()).toMatchObject({ code: "HOST_MISMATCH" });
		expect(calls).toBe(0);
	});
});
