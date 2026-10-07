import type { DiffAnchor } from "@trellis/ui/review";

export function lineCommentSelector({ path, side, line }: DiffAnchor, mode: "split" | "unified") {
	const column = mode === "split" ? `[data-side="${side}"]` : "";
	return `.review-diff-line[data-file-path="${CSS.escape(path)}"][data-${side}-line="${line}"]${column} button[aria-label="Add line comment"]`;
}
