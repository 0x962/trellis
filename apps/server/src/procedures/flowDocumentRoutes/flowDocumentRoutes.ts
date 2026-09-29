import { ORPCError } from "@orpc/server";
import type { FlowDocumentV1 } from "@trellis/api";
import { documentTag } from "../../services/langflowDispatch";
import { call, os } from "../base.ts";
import { saveWithEditor } from "./components/saveWithEditor";

export const flowDocumentProcedures = os.flowDocumentsV1.router({
	editorHost: os.flowDocumentsV1.editorHost.handler(({ context }) => ({ host: context.editorGateway?.host() ?? null })),
	editorSession: os.flowDocumentsV1.editorSession.handler(({ context, input }) => {
		if (!context.editorGateway) throw new ORPCError("EDITOR_UNAVAILABLE", { status: 503, defined: true });
		return context.editorGateway.issue(input, context.headers, context.resHeaders, context);
	}),
	discovery: os.flowDocumentsV1.discovery.handler(({ context, input }) =>
		call(context, "flowDocuments.discovery", input),
	),
	get: os.flowDocumentsV1.get.handler(async ({ context, input }) => {
		const document = await call<FlowDocumentV1>(context, "flowDocuments.get", input);
		context.resHeaders?.set("etag", documentTag(document));
		return document;
	}),
	save: os.flowDocumentsV1.save.handler(async ({ context, input }) => {
		const document = await saveWithEditor(context, input);
		context.resHeaders?.set("etag", documentTag(document));
		return document;
	}),
	view: os.flowDocumentsV1.view.handler(({ context, input }) => call(context, "flowDocuments.view", input)),
	list: os.flowDocumentsV1.list.handler(({ context, input }) => call(context, "flowDocuments.list", input)),
});
