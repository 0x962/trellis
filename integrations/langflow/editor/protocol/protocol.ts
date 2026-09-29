import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const EditorIdentitySchema = z.strictObject({
	host: z.string().min(1),
	actor: z.string().min(1),
	flowId: z.string().min(1),
	revision: z.number().int().positive(),
	documentHash: digest,
	componentManifestHash: digest,
});
export type EditorIdentity = z.infer<typeof EditorIdentitySchema>;

export const EditorContentSchema = z.strictObject({
	schemaVersion: z.literal(1),
	engine: z.literal("langflow"),
	graphDocument: z.record(z.string(), z.json()),
	componentManifestHash: digest,
});
export type EditorContent = z.infer<typeof EditorContentSchema>;

export const EditorFocusSchema = z.strictObject({
	nodeId: z.string().min(1),
	field: z.string().nullable(),
});
export type EditorFocus = z.infer<typeof EditorFocusSchema>;

const envelope = {
	protocol: z.literal("trellis-editor-v1"),
	channel: z.uuid(),
	identity: EditorIdentitySchema,
	sequence: z.number().int().positive(),
};

export const EditorEventSchema = z.discriminatedUnion("type", [
	z.strictObject({ ...envelope, type: z.literal("ready") }),
	z.strictObject({ ...envelope, type: z.literal("draft-changed"), content: EditorContentSchema }),
	z.strictObject({ ...envelope, type: z.literal("selection-changed"), focus: EditorFocusSchema.nullable() }),
]);
export type EditorEvent = z.infer<typeof EditorEventSchema>;

export const EditorCommandSchema = z.discriminatedUnion("type", [
	z.strictObject({ ...envelope, type: z.literal("initialize"), content: EditorContentSchema }),
	z.strictObject({ ...envelope, type: z.literal("select-issue"), focus: EditorFocusSchema }),
	z.strictObject({ ...envelope, type: z.literal("restore-focus"), focus: EditorFocusSchema.nullable() }),
]);
export type EditorCommand = z.infer<typeof EditorCommandSchema>;

export function sameEditorIdentity(left: EditorIdentity, right: EditorIdentity) {
	return (
		left.host === right.host &&
		left.actor === right.actor &&
		left.flowId === right.flowId &&
		left.revision === right.revision &&
		left.documentHash === right.documentHash &&
		left.componentManifestHash === right.componentManifestHash
	);
}
