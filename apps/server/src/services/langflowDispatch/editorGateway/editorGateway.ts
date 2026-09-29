import { ORPCError } from "@orpc/server";
import { type ActorRef, EditorSessionSchema, type FlowDocumentV1 } from "@trellis/api";
import type { Config } from "../../../config";
import { systemContext } from "../../../context";
import type { ServiceTransport } from "../../../db/transport";
import type { HostControlIdentity } from "../../../langflowHost";
import {
	createLangflowEditorSessions,
	type EditorParentSave,
	type EditorSessionOptions,
} from "../../langflowEditorSessions";
import type { ServiceName } from "../../registry";

export type EditorGatewayConfiguration = {
	identity: HostControlIdentity;
	parentOrigin: string;
	editorOrigin: string;
	grantDurationMs?: number;
	installedManifest: EditorSessionOptions["installedManifest"];
};

export function editorGateway(config: Config, transport: ServiceTransport, input: EditorGatewayConfiguration) {
	if (config.authToken === null) throw new Error("editor_host_token_required");
	const duration = input.grantDurationMs ?? 3_600_000;
	if (!Number.isFinite(duration) || duration <= 0) throw new Error("editor_grant_duration_invalid");
	const call = <T>(actor: ActorRef, name: ServiceName, value: unknown) =>
		transport.call(name, { ...systemContext(), actor }, value) as Promise<T>;
	const sessions = createLangflowEditorSessions({
		hostId: `${input.identity.hostId}:${input.identity.dataHomeId}`,
		hostToken: config.authToken,
		parentOrigin: input.parentOrigin,
		editorOrigin: input.editorOrigin,
		actor: async () => {
			const stored = (await transport.call("settings.defaultActorName", systemContext(), undefined)) as {
				name: string;
				stored: boolean;
			};
			if (!stored.stored || stored.name.trim() === "")
				throw new ORPCError("EDITOR_ACTOR_UNCONFIGURED", { status: 503 });
			return { kind: "human", name: stored.name };
		},
		now: () => new Date(),
		expiresAt: (now) => new Date(now.getTime() + duration),
		installedManifest: input.installedManifest,
		documents: {
			get: (actor, value) => call(actor, "langflowEditor.readDocument", value),
			save: (actor, value) => call(actor, "langflowEditor.saveDocument", value),
			receipt: (actor, value) => call(actor, "langflowEditor.readSaveReceipt", value),
		},
	});
	return {
		...sessions,
		withDocumentSave: (request: EditorParentSave, save: () => Promise<FlowDocumentV1>, headers: Headers) => {
			if (headers.get("origin") !== input.parentOrigin)
				throw new ORPCError("EDITOR_ACCESS_REFUSED", {
					status: 403,
					defined: true,
					data: { code: "ORIGIN_MISMATCH", status: 403 },
				});
			return sessions.withDocumentSave(request, save);
		},
		issue: async (value: { flow: string; expectedVersion: number }, headers: Headers, responseHeaders?: Headers) => {
			const forwarded = new Headers(headers);
			forwarded.set("content-type", "application/json");
			const response = await sessions.fetch(
				new Request(`${input.parentOrigin}/api/trellis-editor/v1/sessions`, {
					method: "POST",
					headers: forwarded,
					body: JSON.stringify(value),
				}),
			);
			const body = await response.json();
			if (!response.ok)
				throw new ORPCError("EDITOR_ACCESS_REFUSED", {
					status: 403,
					defined: true,
					data: { code: body.code, status: response.status },
				});
			for (const cookie of response.headers.getSetCookie()) responseHeaders?.append("set-cookie", cookie);
			return EditorSessionSchema.parse(body);
		},
	};
}
