import { z } from "zod";
import { pickErrors } from "../../errors.ts";
import { FlowRefSchema } from "../../schemas/flow.ts";
import { EditorSessionSchema } from "../../schemas/flowEditorSessionV1.ts";
import { base } from "../base.ts";

export const flowEditorErrors = {
	...pickErrors(["FLOW_VERSION_CONFLICT"]),
	EDITOR_ACTOR_UNCONFIGURED: {
		status: 503,
		message: "Configure the human actor before the editor opens.",
		data: z.undefined(),
	},
	EDITOR_SAVE_IN_PROGRESS: { status: 409, message: "The editor save is still pending.", data: z.undefined() },
	EDITOR_SESSION_REQUIRED: { status: 401, message: "The editor session is required.", data: z.undefined() },
	EDITOR_FLOW_UNSUPPORTED: { status: 409, message: "This flow cannot use the Langflow editor.", data: z.undefined() },
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

export const flowEditorHostV1 = base
	.route({ method: "GET", path: "/flows/editor-host-v1", summary: "Read the current editor host identity" })
	.input(z.strictObject({}))
	.output(z.strictObject({ host: z.string().nullable() }));
