import { expect, test } from "bun:test";
import { type EditorSession, pendingDocumentV1Example } from "@trellis/api";
import { type CurrentEditorIdentity, loadEditorMount } from "./loadEditorMount";

function fixture() {
	const document = structuredClone(pendingDocumentV1Example);
	let identity: CurrentEditorIdentity = { host: "host-a:data-a", actor: "human:Navid" };
	const session: EditorSession = {
		channel: "00000000-0000-4000-8000-000000000001",
		identity: {
			host: "host-a:data-a",
			actor: "human:Navid",
			flowId: document.flow.id,
			revision: document.revision,
			documentHash: document.documentHash,
			componentManifestHash: document.componentManifestHash,
		},
		content: {
			schemaVersion: 1,
			engine: "langflow",
			graphDocument: document.graphDocument,
			componentManifestHash: document.componentManifestHash,
		},
		editorOrigin: "http://localhost:4172",
		expiresAt: "2026-09-30T00:00:00Z",
	};
	const issued: unknown[] = [];
	const api = {
		get: async () => document,
		editorSession: async (input: { flow: string; expectedVersion: number }) => {
			issued.push(input);
			return session;
		},
	};
	return {
		document,
		session,
		api,
		issued,
		current: () => identity,
		change: (next: CurrentEditorIdentity) => {
			identity = next;
		},
	};
}

test("issues the session against the current saved revision and stable flow ID", async () => {
	const f = fixture();
	const result = await loadEditorMount(f.api, "flow-slug", f.current);
	expect(f.issued).toEqual([{ flow: f.document.flow.id, expectedVersion: f.document.revision }]);
	expect(result).toEqual({ document: f.document, session: f.session });
});

test("an unconfigured host cannot issue a grant", async () => {
	const f = fixture();
	f.change({ host: null, actor: "human:Navid" });
	await expect(loadEditorMount(f.api, "flow-slug", f.current)).rejects.toThrow("unavailable");
	expect(f.issued).toHaveLength(0);
});

test("an actor change during the document read stops issuance", async () => {
	const f = fixture();
	f.api.get = async () => {
		f.change({ host: "host-a:data-a", actor: "human:Other" });
		return f.document;
	};
	await expect(loadEditorMount(f.api, "flow-slug", f.current)).rejects.toThrow("identity changed");
	expect(f.issued).toHaveLength(0);
});

test("a data home replacement during issuance rejects the returned grant", async () => {
	const f = fixture();
	f.api.editorSession = async () => {
		f.change({ host: "host-a:data-b", actor: "human:Navid" });
		return f.session;
	};
	await expect(loadEditorMount(f.api, "flow-slug", f.current)).rejects.toThrow("does not match");
});

test("a grant for another document revision cannot mount", async () => {
	const f = fixture();
	f.session.identity.revision += 1;
	await expect(loadEditorMount(f.api, "flow-slug", f.current)).rejects.toThrow("does not match");
});
