import { ORPCError } from "@orpc/server";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { call, type ProcedureContext } from "../../base";

const accessErrors = new Set([
	"EDITOR_SESSION_REQUIRED",
	"EDITOR_EXPIRED",
	"EDITOR_REVOKED",
	"EDITOR_SAVE_IN_PROGRESS",
	"ACTOR_MISMATCH",
	"MANIFEST_MISMATCH",
	"FLOW_MISMATCH",
	"IDENTITY_MISMATCH",
	"PROJECT_MISMATCH",
]);

export async function saveWithEditor(context: ProcedureContext, input: FlowDocumentSaveV1Input) {
	const save = () =>
		call<FlowDocumentV1>(context, "flowDocuments.save", {
			document: input,
			ifMatch: context.headers.get("if-match"),
			ifNoneMatch: context.headers.get("if-none-match"),
		});
	const channel = context.headers.get("x-trellis-editor-channel");
	if (channel === null) return save();
	if (context.editorGateway === undefined) throw new ORPCError("EDITOR_UNAVAILABLE", { status: 503, defined: true });
	if (context.actor === null) throw new ORPCError("ACTOR_REQUIRED", { status: 400, defined: true });
	try {
		return await context.editorGateway.withDocumentSave(
			{ channel, actor: context.actor, input },
			save,
			context.headers,
		);
	} catch (error) {
		if (!(error instanceof ORPCError)) throw error;
		if (error.code === "FLOW_VERSION_CONFLICT" && error.data === undefined) {
			const current = await call<FlowDocumentV1>(context, "flowDocuments.get", { flow: input.flow });
			throw new ORPCError("FLOW_VERSION_CONFLICT", { status: 412, defined: true, data: { version: current.revision } });
		}
		if (error.code === "FLOW_REQUEST_CONFLICT" && error.data === undefined)
			throw new ORPCError("FLOW_REQUEST_CONFLICT", {
				status: 409,
				defined: true,
				data: { requestId: input.requestId },
			});
		if (accessErrors.has(error.code))
			throw new ORPCError("EDITOR_ACCESS_REFUSED", {
				status: 403,
				defined: true,
				data: { code: error.code, status: error.status },
			});
		throw error;
	}
}
