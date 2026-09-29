import { createHash, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { EditorIdentitySchema } from "../../../../../../integrations/langflow/editor/protocol";
import { editorFailure } from "../failure";
import type { EditorGrant, EditorSessionOptions } from "../types";

export const sessionPath = (channel: string) => `/api/trellis-editor/v1/sessions/${channel}`;
export const cookieName = "trellis_editor";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function assertActive(grant: EditorGrant, options: EditorSessionOptions) {
	if (grant.revoked) throw editorFailure("EDITOR_REVOKED");
	if (Date.parse(grant.session.expiresAt) <= options.now().getTime()) throw editorFailure("EDITOR_EXPIRED");
	if (grant.session.identity.host !== options.hostId) throw editorFailure("HOST_MISMATCH");
}

export async function authorize(c: Context, grant: EditorGrant, options: EditorSessionOptions, bootstrap = false) {
	assertActive(grant, options);
	const origin = c.req.header("origin");
	const urlOrigin = new URL(c.req.url).origin;
	if (urlOrigin !== options.parentOrigin && urlOrigin !== options.editorOrigin) throw editorFailure("HOST_MISMATCH");
	const referer = c.req.header("referer");
	const source = origin ?? (c.req.method === "GET" && referer ? new URL(referer).origin : null);
	if (source !== options.parentOrigin && source !== options.editorOrigin) throw editorFailure("ORIGIN_MISMATCH");
	const token = getCookie(c, cookieName);
	if (!token || !timingSafeEqual(Buffer.from(tokenHash(token)), Buffer.from(grant.tokenHash)))
		throw editorFailure("EDITOR_SESSION_REQUIRED", 401);
	const actor = await options.actor();
	if (actor.kind !== grant.actor.kind || actor.name !== grant.actor.name) throw editorFailure("ACTOR_MISMATCH");
	const identity = bootstrap
		? grant.session.identity
		: EditorIdentitySchema.parse(JSON.parse(c.req.header("x-trellis-editor-identity") ?? "null"));
	const expected = grant.session.identity;
	if (identity.host !== expected.host) throw editorFailure("HOST_MISMATCH");
	if (identity.actor !== expected.actor) throw editorFailure("ACTOR_MISMATCH");
	if (identity.flowId !== expected.flowId) throw editorFailure("FLOW_MISMATCH");
	if (identity.componentManifestHash !== expected.componentManifestHash) throw editorFailure("MANIFEST_MISMATCH");
	if (!bootstrap && c.req.header("x-trellis-editor-project") !== (grant.project ?? ""))
		throw editorFailure("PROJECT_MISMATCH");
	const manifest = await options.installedManifest();
	if (manifest.hash !== expected.componentManifestHash) throw editorFailure("MANIFEST_MISMATCH");
	assertActive(grant, options);
	return { identity, manifest };
}
