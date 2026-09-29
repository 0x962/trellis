import { ORPCError } from "@orpc/server";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { call, type ProcedureContext } from "../../../base";

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
	return context.editorGateway.withDocumentSave(
		{ channel, actor: context.actor, input },
		save,
		context.headers,
		context,
	);
}
