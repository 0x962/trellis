import { FlowDocumentSaveV1InputSchema } from "@trellis/api";
import type { Context } from "hono";
import { authorize } from "../authorization";
import { commitSave } from "../commitSave";
import type { EditorGrant, EditorSessionOptions } from "../types";

export async function acceptSave(c: Context, grant: EditorGrant, options: EditorSessionOptions) {
	const { identity, manifest } = await authorize(c, grant, options);
	const bytes = new Uint8Array(await c.req.arrayBuffer());
	const value = JSON.parse(new TextDecoder().decode(bytes));
	const input = FlowDocumentSaveV1InputSchema.parse(value);
	const response = await commitSave(grant, options, { identity, manifest, bytes, value }, () =>
		options.documents.save(grant.actor, { document: input, projectId: grant.projectId }),
	);
	return new Response(response, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
