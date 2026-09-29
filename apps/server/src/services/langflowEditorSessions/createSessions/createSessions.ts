import { ORPCError } from "@orpc/server";
import type { FlowDocumentV1 } from "@trellis/api";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { editorOrigin } from "../../../../../../integrations/langflow/editor/editorOrigin";
import { sameEditorIdentity } from "../../../../../../integrations/langflow/editor/protocol";
import { hostAuth } from "../../../auth/auth.ts";
import { acceptSave } from "../acceptSave";
import { assertActive, authorize, cookieName, sessionPath } from "../authorization";
import { currentDocument } from "../currentDocument";
import { editorFailure } from "../failure";
import { issueSession } from "../issueSession";
import { parentSave } from "../parentSave";
import type { EditorGrant, EditorParentSave, EditorSessionIssueInput, EditorSessionOptions } from "../types";

const base = "/api/trellis-editor/v1/sessions";
const IssueSchema = z.strictObject({ flow: z.string().min(1), expectedVersion: z.number().int().positive() });

export function createLangflowEditorSessions(options: EditorSessionOptions) {
	editorOrigin(options.editorOrigin, options.parentOrigin);
	const parent = new URL(options.parentOrigin);
	const editor = new URL(options.editorOrigin);
	if (
		!options.hostToken ||
		parent.origin !== options.parentOrigin ||
		parent.hostname !== editor.hostname ||
		parent.protocol !== editor.protocol
	)
		throw new Error("The editor and Trellis require separate origins on the same cookie host and scheme.");
	const grants = new Map<string, EditorGrant>();
	const issue = (input: EditorSessionIssueInput) => issueSession(grants, options, input);
	const app = new Hono();
	app.use("*", async (c, next) => {
		c.header("cache-control", "no-store");
		c.header("x-content-type-options", "nosniff");
		const origin = c.req.header("origin");
		if (origin === options.parentOrigin || origin === options.editorOrigin) {
			c.header("access-control-allow-origin", origin);
			c.header("access-control-allow-credentials", "true");
			c.header("vary", "Origin");
		}
		await next();
	});
	app.onError((error, c) => {
		if (error instanceof ORPCError)
			return new Response(JSON.stringify({ code: error.code, status: error.status, message: error.message }), {
				status: error.status,
				headers: { "content-type": "application/json", "cache-control": "no-store" },
			});
		if (error instanceof z.ZodError || error instanceof SyntaxError)
			return c.json({ code: "INPUT_VALIDATION_FAILED", message: "The editor request is invalid." }, 400);
		throw error;
	});
	app.options("*", (c) => {
		if (![options.parentOrigin, options.editorOrigin].includes(c.req.header("origin") ?? ""))
			throw editorFailure("ORIGIN_MISMATCH");
		c.header("access-control-allow-methods", "GET, POST, PUT, DELETE");
		c.header("access-control-allow-headers", "content-type, x-trellis-editor-identity, x-trellis-editor-project");
		return c.body(null, 204);
	});
	const parentAuth = hostAuth(options.hostToken);
	app.post(base, parentAuth, async (c) => {
		if (new URL(c.req.url).origin !== options.parentOrigin) throw editorFailure("HOST_MISMATCH");
		if (c.req.header("origin") !== options.parentOrigin) throw editorFailure("ORIGIN_MISMATCH");
		const input = IssueSchema.parse(await c.req.json());
		const { session, credential } = await issue(input);
		setCookie(c, cookieName, credential.token, {
			httpOnly: true,
			secure: parent.protocol === "https:",
			sameSite: "Strict",
			path: sessionPath(session.channel),
			expires: credential.expiresAt,
		});
		return c.json(session, 201);
	});
	app.all(`${base}/:channel/*`, async (c) => {
		const grant = grants.get(c.req.param("channel"));
		if (!grant) throw editorFailure("EDITOR_SESSION_REQUIRED", 401);
		const operation = new URL(c.req.url).pathname.slice(sessionPath(grant.session.channel).length);
		if (c.req.method === "PUT" && operation === "/document") return acceptSave(c, grant, options);
		const { identity, manifest } = await authorize(c, grant, options, operation === "/session");
		if (c.req.method === "DELETE" && operation === "/grant") {
			grant.revoked = true;
			grant.receipts.clear();
			setCookie(c, cookieName, "", {
				httpOnly: true,
				secure: parent.protocol === "https:",
				sameSite: "Strict",
				path: sessionPath(grant.session.channel),
				maxAge: 0,
			});
			return c.json({ revoked: true });
		}
		if (c.req.method !== "GET" || !["/document", "/component-manifest", "/grant", "/session"].includes(operation))
			throw editorFailure("OPERATION_DENIED");
		if (!sameEditorIdentity(identity, grant.session.identity)) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
		const document = await currentDocument(grant, options);
		assertActive(grant, options);
		if (operation === "/session")
			return c.json({
				channel: grant.session.channel,
				identity: grant.session.identity,
				parentOrigin: options.parentOrigin,
				project: grant.project,
				expiresAt: grant.session.expiresAt,
			});
		if (operation === "/grant") return c.json(grant.session);
		if (operation === "/component-manifest") return c.json(manifest.publicManifest);
		return c.json(document);
	});
	app.all("*", () => {
		throw editorFailure("OPERATION_DENIED");
	});
	return {
		issue,
		fetch: (request: Request) => app.fetch(request),
		withDocumentSave: (request: EditorParentSave, save: () => Promise<FlowDocumentV1>) =>
			parentSave(grants, options, request, save),
	};
}
