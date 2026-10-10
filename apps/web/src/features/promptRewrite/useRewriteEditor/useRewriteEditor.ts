import type { Editor } from "@tiptap/core";
import { useLayoutEffect } from "react";
import { registerRichRewriteTarget } from "../richRewriteTarget";

export function useRewriteEditor(editor: Editor | null, identity: string, format: "markdown" | "plain" = "markdown") {
	useLayoutEffect(() => {
		if (editor && identity) return registerRichRewriteTarget(editor, format);
	}, [editor, identity, format]);
}
