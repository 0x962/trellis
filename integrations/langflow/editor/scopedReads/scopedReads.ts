import { z } from "zod";
import { readEditorCatalog } from "../editorCatalog";
import { editorOrigin } from "../editorOrigin";
import { EditorContentSchema } from "../protocol";
import { EditorBootstrapSchema } from "../session";

const documentSchema = EditorContentSchema.extend({
	flow: z.object({ id: z.string(), name: z.string(), description: z.string(), project: z.string().nullable() }),
	revision: z.number().int().positive(),
	documentHash: z.string(),
}).passthrough();

type Options = {
	channel: string;
	origin: string;
	flowId: string;
	fetch: typeof fetch;
	now: () => number;
};

export async function openEditorReads(options: Options) {
	const channel = z.uuid().parse(options.channel);
	const base = `${options.origin}/api/trellis-editor/v1/sessions/${channel}`;
	const get = async (path: string, headers?: HeadersInit): Promise<unknown> => {
		const response = await options.fetch(`${base}/${path}`, {
			method: "GET",
			credentials: "same-origin",
			referrerPolicy: "origin",
			redirect: "error",
			cache: "no-store",
			headers,
		});
		if (!response.ok) throw new Error(`The editor read failed (${response.status}).`);
		return response.json();
	};
	const bootstrap = EditorBootstrapSchema.parse(await get("session"));
	editorOrigin(options.origin, bootstrap.parentOrigin);
	if (bootstrap.channel !== channel || bootstrap.identity.flowId !== options.flowId) {
		throw new Error("The editor bootstrap belongs to another mount.");
	}
	const active = () => {
		if (options.now() >= Date.parse(bootstrap.expiresAt)) throw new Error("The editor session has expired.");
	};
	active();
	const read = async (path: string) => {
		active();
		const value = await get(path, {
			"x-trellis-editor-identity": JSON.stringify(bootstrap.identity),
			"x-trellis-editor-project": bootstrap.project ?? "",
		});
		active();
		return value;
	};
	const document = async () => {
		const result = documentSchema.parse(await read("document"));
		if (
			result.flow.id !== bootstrap.identity.flowId ||
			result.flow.project !== bootstrap.project ||
			result.componentManifestHash !== bootstrap.identity.componentManifestHash
		)
			throw new Error("The editor document does not match its grant.");
		return result;
	};
	const catalog = async () =>
		readEditorCatalog(await read("component-manifest"), bootstrap.identity.componentManifestHash);
	return { bootstrap, document, catalog };
}
