import { AsyncLocalStorage } from "node:async_hooks";
import { timingSafeEqual } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type { ActorRef, FlowDocumentV1 } from "@trellis/api";
import { serialize } from "hono/utils/cookie";
import type { Config } from "../config";
import { SYSTEM_ACTOR } from "../context";
import type { ServiceTransport } from "../db/transport";
import { type HostControlIdentity, LangflowHostControl } from "../langflowHost";
import type { DbTiming } from "../serverTiming";
import {
	createLangflowEditorSessions,
	type EditorParentSave,
	type EditorSessionOptions,
} from "../services/langflowEditorSessions";
import type { ServiceName } from "../services/registry";
import { editorError } from "./components/editorError";

export type EditorRequestScope = { reqId: string; timing?: DbTiming };
export type EditorGatewayConfiguration = {
	identity: HostControlIdentity;
	parentOrigin: string;
	editorOrigin: string;
	grantDurationMs?: number;
	installedManifest: EditorSessionOptions["installedManifest"];
};

export function editorGateway(config: Config, transport: ServiceTransport, input: EditorGatewayConfiguration) {
	const hostToken = config.authToken;
	if (hostToken === null) throw new Error("editor_host_token_required");
	const duration = input.grantDurationMs ?? 3_600_000;
	if (!Number.isFinite(duration) || duration <= 0) throw new Error("editor_grant_duration_invalid");
	const requests = new AsyncLocalStorage<EditorRequestScope>();
	const call = <T>(actor: ActorRef, name: ServiceName, value: unknown) => {
		const scope = requests.getStore()!;
		return transport.call(
			name,
			{ actor, session: null, now: new Date(), reqId: scope.reqId },
			value,
			scope.timing,
		) as Promise<T>;
	};
	const host = () => {
		const current = LangflowHostControl.readIdentity(config.home);
		return `${current.hostId}:${current.dataHomeId}`;
	};
	const actor = async (): Promise<ActorRef> => {
		if (host() !== `${input.identity.hostId}:${input.identity.dataHomeId}`)
			throw new ORPCError("HOST_MISMATCH", { status: 403 });
		const stored = await call<{ name: string; stored: boolean }>(SYSTEM_ACTOR, "settings.defaultActorName", undefined);
		if (!stored.stored || stored.name.trim() === "") throw new ORPCError("EDITOR_ACTOR_UNCONFIGURED", { status: 503 });
		return { kind: "human", name: stored.name };
	};
	const assertParent = (headers: Headers) => {
		const actual = Buffer.from(headers.get("authorization") ?? "");
		const expected = Buffer.from(`Bearer ${hostToken}`);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
			throw new ORPCError("EDITOR_SESSION_REQUIRED", { status: 401, defined: true });
		if (headers.get("origin") !== input.parentOrigin)
			throw new ORPCError("EDITOR_ACCESS_REFUSED", {
				status: 403,
				defined: true,
				data: { code: "ORIGIN_MISMATCH", status: 403 },
			});
	};
	const sessions = createLangflowEditorSessions({
		hostId: `${input.identity.hostId}:${input.identity.dataHomeId}`,
		hostToken,
		parentOrigin: input.parentOrigin,
		editorOrigin: input.editorOrigin,
		actor,
		now: () => new Date(),
		expiresAt: (now) => new Date(now.getTime() + duration),
		installedManifest: input.installedManifest,
		documents: {
			get: (actor, value) => call(actor, "langflowEditor.readDocument", value),
			save: (actor, value) => call(actor, "langflowEditor.saveDocument", value),
			receipt: (actor, value) => call(actor, "langflowEditor.readSaveReceipt", value),
		},
	});
	const readVersion = async (flow: string) =>
		(await call<FlowDocumentV1>(await actor(), "flowDocuments.get", { flow })).revision;
	return {
		host,
		fetch: (request: Request, scope: EditorRequestScope) => requests.run(scope, () => sessions.fetch(request)),
		withDocumentSave: (
			request: EditorParentSave,
			save: () => Promise<FlowDocumentV1>,
			headers: Headers,
			scope: EditorRequestScope,
		) =>
			requests.run(scope, async () => {
				assertParent(headers);
				try {
					return await sessions.withDocumentSave(request, save);
				} catch (error) {
					return editorError(error, request.input, () => readVersion(request.input.flow));
				}
			}),
		issue: (
			value: { flow: string; expectedVersion: number },
			headers: Headers,
			responseHeaders: Headers | undefined,
			scope: EditorRequestScope,
		) =>
			requests.run(scope, async () => {
				assertParent(headers);
				try {
					const { session, credential } = await sessions.issue(value);
					responseHeaders?.append(
						"set-cookie",
						serialize("trellis_editor", credential.token, {
							httpOnly: true,
							secure: new URL(input.parentOrigin).protocol === "https:",
							sameSite: "Strict",
							path: `/api/trellis-editor/v1/sessions/${session.channel}`,
							expires: credential.expiresAt,
						}),
					);
					return session;
				} catch (error) {
					return editorError(error, {}, () => readVersion(value.flow));
				}
			}),
	};
}
