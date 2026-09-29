import { z } from "zod";
import { FlowRefSchema } from "../schemas/flow.ts";
import { EditorSessionSchema } from "../schemas/flowEditorSessionV1.ts";
import { base } from "./base.ts";

export const flowEditorErrors = {
	EDITOR_UNAVAILABLE: { status: 503, message: "The editor is unavailable.", data: z.undefined() },
	EDITOR_ACCESS_REFUSED: {
		status: 403,
		message: "The editor request was refused.",
		data: z.strictObject({ code: z.string(), status: z.number().int() }),
	},
};
export const flowEditorSessionV1 = base
	.route({ method: "POST", path: "/flows/{flow}/editor-session-v1", summary: "Issue a scoped editor session" })
	.errors(flowEditorErrors)
	.input(z.strictObject({ flow: FlowRefSchema, expectedVersion: z.number().int().positive() }))
	.output(EditorSessionSchema);
