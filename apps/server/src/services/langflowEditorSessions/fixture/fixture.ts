import type { FlowDocumentSaveV1Input } from "@trellis/api";
import { EditorSessionSchema } from "../../../../../../integrations/langflow/editor/session";
import { save as saveFlowDocument } from "../../flowDocuments";
import { flowId, manifestHash, saveInput, serviceFixture } from "../../flowDocuments/fixture";
import { createLangflowEditorSessions } from "../createSessions";
import { editorFailure } from "../failure";
import { readDocument } from "../readDocument";
import { saveDocument } from "../saveDocument";
import type { EditorSessionOptions } from "../types";

export async function editorFixture() {
	const fixture = await serviceFixture();
	await fixture.run((tx) => saveFlowDocument(fixture.ctx, tx, saveInput()));
	const setup = async () => {
		let now = new Date("2026-09-29T08:01:00Z");
		let hash = manifestHash;
		let actor = { kind: "human" as const, name: "test" };
		let writes = 0;
		const options: EditorSessionOptions = {
			hostId: "host-test",
			hostToken: "private-host-token",
			parentOrigin: "http://127.0.0.1:4521",
			editorOrigin: "http://127.0.0.1:4522",
			actor: async () => actor,
			now: () => now,
			expiresAt: () => new Date("2026-09-29T09:00:00Z"),
			installedManifest: async () => ({
				hash,
				publicManifest: { fixture: true },
				assertContent: async (content) => {
					if (content.graphDocument.substitute === true) throw editorFailure("COMPONENT_SUBSTITUTION");
				},
			}),
			documents: {
				get: (actor, input) => fixture.run((tx) => readDocument({ ...fixture.ctx, actor, now }, tx, input)),
				save: (actor, input) => {
					writes += 1;
					return fixture.run((tx) => saveDocument({ ...fixture.ctx, actor, now }, tx, input));
				},
			},
		};
		const server = createLangflowEditorSessions(options);
		const current = await options.documents.get(actor, { flow: flowId });
		const issue = (
			headers: Record<string, string> = {},
			body: unknown = { flow: flowId, expectedVersion: current.document.revision },
		) =>
			server.fetch(
				new Request(`${options.parentOrigin}/api/trellis-editor/v1/sessions`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${options.hostToken}`,
						origin: options.parentOrigin,
						"content-type": "application/json",
						...headers,
					},
					body: JSON.stringify(body),
				}),
			);
		const issued = await issue();
		const session = EditorSessionSchema.parse(await issued.json());
		const cookie = issued.headers.get("set-cookie")!;
		const path = `/api/trellis-editor/v1/sessions/${session.channel}`;
		const request = (
			operation: string,
			method = "GET",
			body?: string,
			headers: Record<string, string> = {},
			origin = options.parentOrigin,
		) =>
			server.fetch(
				new Request(`${origin}${path}/${operation}`, {
					method,
					headers: {
						cookie: cookie.split(";")[0]!,
						origin: options.editorOrigin,
						"content-type": "application/json",
						"x-trellis-editor-identity": JSON.stringify(session.identity),
						"x-trellis-editor-project": "TRL",
						...headers,
					},
					body,
				}),
			);
		const input = (revision = session.identity.revision): Extract<FlowDocumentSaveV1Input, { engine: "langflow" }> => ({
			...saveInput(revision),
			engine: "langflow",
			componentManifestHash: manifestHash,
			graphDocument: { nodes: [], edges: [], text: "a saved edit" },
		});
		const parentSave = (input: FlowDocumentSaveV1Input) =>
			server.withDocumentSave({ channel: session.channel, actor, input }, () =>
				options.documents.save(actor, { document: input, projectId: current.projectId }),
			);
		return {
			server,
			options,
			session,
			cookie,
			issue,
			request,
			input,
			parentSave,
			current,
			writes: () => writes,
			setTime: (value: string) => {
				now = new Date(value);
			},
			setManifest: (value: string) => {
				hash = value;
			},
			setActor: (name: string) => {
				actor = { kind: "human", name };
			},
		};
	};
	return { ...fixture, setup };
}
