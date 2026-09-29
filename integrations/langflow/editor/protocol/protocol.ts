import type { EditorIdentity } from "@trellis/api";

export type { EditorCommand, EditorContent, EditorEvent, EditorFocus, EditorIdentity } from "@trellis/api";
export {
	EditorCommandSchema,
	EditorContentSchema,
	EditorEventSchema,
	EditorFocusSchema,
	EditorIdentitySchema,
} from "@trellis/api";

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
