import type { FlowDocumentV1 } from "@trellis/api";
import { documentTag } from "../../services/langflowDispatch";
import { call, os } from "../base.ts";

export const flowDocumentProcedures = os.flowDocumentsV1.router({
	discovery: os.flowDocumentsV1.discovery.handler(({ context, input }) =>
		call(context, "flowDocuments.discovery", input),
	),
	get: os.flowDocumentsV1.get.handler(async ({ context, input }) => {
		const document = await call<FlowDocumentV1>(context, "flowDocuments.get", input);
		context.resHeaders?.set("etag", documentTag(document));
		return document;
	}),
	save: os.flowDocumentsV1.save.handler(async ({ context, input }) => {
		const ifMatch = context.headers.get("if-match");
		const ifNoneMatch = context.headers.get("if-none-match");
		const document = await call<FlowDocumentV1>(context, "flowDocuments.save", {
			document: input,
			ifMatch,
			ifNoneMatch,
		});
		context.resHeaders?.set("etag", documentTag(document));
		return document;
	}),
	view: os.flowDocumentsV1.view.handler(({ context, input }) => call(context, "flowDocuments.view", input)),
	list: os.flowDocumentsV1.list.handler(({ context, input }) => call(context, "flowDocuments.list", input)),
});
