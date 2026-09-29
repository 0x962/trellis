import { z } from "zod";
import { EditorContentSchema, EditorIdentitySchema } from "../protocol";

const origin = z.string().refine((value) => {
	try {
		const url = new URL(value);
		return ["http:", "https:"].includes(url.protocol) && url.origin === value;
	} catch {
		return false;
	}
}, "An editor origin must be an exact HTTP origin.");

export const EditorSessionSchema = z
	.strictObject({
		channel: z.uuid(),
		identity: EditorIdentitySchema,
		content: EditorContentSchema,
		editorOrigin: origin,
		expiresAt: z.iso.datetime(),
	})
	.refine(
		(session) => session.content.componentManifestHash === session.identity.componentManifestHash,
		"The editor content must use the granted component catalog.",
	);
export type EditorSession = z.infer<typeof EditorSessionSchema>;

export const EditorBootstrapSchema = z.strictObject({
	channel: z.uuid(),
	identity: EditorIdentitySchema,
	parentOrigin: origin,
	expiresAt: z.iso.datetime(),
});
export type EditorBootstrap = z.infer<typeof EditorBootstrapSchema>;
