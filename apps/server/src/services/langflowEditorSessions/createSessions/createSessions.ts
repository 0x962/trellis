import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { FlowDocumentV1 } from "@trellis/api";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import { editorOrigin } from "../../../../../../integrations/langflow/editor/editorOrigin";
import { sameEditorIdentity } from "../../../../../../integrations/langflow/editor/protocol";
import { EditorSessionSchema } from "../../../../../../integrations/langflow/editor/session";
import { hostAuth } from "../../../auth/auth.ts";
import { acceptSave } from "../acceptSave";
import { assertActive, authorize, cookieName, sessionPath, tokenHash } from "../authorization";
import { currentDocument } from "../currentDocument";
import { editorFailure } from "../failure";
import { parentSave } from "../parentSave";
import type { EditorGrant, EditorParentSave, EditorSessionOptions } from "../types";

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
		const actor = await options.actor();
		if (actor.kind !== "human") throw editorFailure("ACTOR_MISMATCH");
		const { document, projectId } = await options.documents.get(actor, { flow: input.flow });
		if (document.engine !== "langflow") throw editorFailure("FLOW_UNSUPPORTED_FORMAT", 409);
		if (document.revision !== input.expectedVersion) throw editorFailure("FLOW_VERSION_CONFLICT", 412);
		const manifest = await options.installedManifest();
		if (manifest.hash !== document.componentManifestHash) throw editorFailure("MANIFEST_MISMATCH");
		const content = {
			schemaVersion: 1 as const,
			engine: "langflow" as const,
			graphDocument: document.graphDocument,
			componentManifestHash: document.componentManifestHash,
		};
		await manifest.assertContent(content);
		const now = options.now();
		const expiry = options.expiresAt(now);
		if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime())
			throw new Error("The editor policy must supply a future expiry.");
		for (const [channel, grant] of grants) {
			if (grant.revoked || Date.parse(grant.session.expiresAt) <= now.getTime()) grants.delete(channel);
		}
		const session = EditorSessionSchema.parse({
			channel: crypto.randomUUID(),
			identity: {
				host: options.hostId,
				actor: `${actor.kind}:${actor.name}`,
				flowId: document.flow.id,
				revision: document.revision,
				documentHash: document.documentHash,
				componentManifestHash: manifest.hash,
			},
			content,
			editorOrigin: options.editorOrigin,
			expiresAt: expiry.toISOString(),
		});
		const token = randomBytes(32).toString("base64url");
		grants.set(session.channel, {
			session,
			actor,
			projectId,
			project: document.flow.project,
			revision: document.revision,
			documentHash: document.documentHash,
			tokenHash: tokenHash(token),
			revoked: false,
			conflicted: false,
			busy: false,
			pending: null,
			receipts: new Map(),
		});
		setCookie(c, cookieName, token, {
			httpOnly: true,
			secure: parent.protocol === "https:",
			sameSite: "Strict",
			path: sessionPath(session.channel),
			expires: expiry,
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
		fetch: (request: Request) => app.fetch(request),
		withDocumentSave: (request: EditorParentSave, save: () => Promise<FlowDocumentV1>) =>
			parentSave(grants, options, request, save),
	};
}
