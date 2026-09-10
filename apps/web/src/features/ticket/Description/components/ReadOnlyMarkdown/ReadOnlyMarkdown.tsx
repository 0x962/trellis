import { cx } from "@trellis/ui";
import { renderMarkdown } from "../../../../../lib/markdown";

export type ReadOnlyMarkdownProps = {
	markdown: string;
	className?: string;
	formatClassName?: "markdown" | "comment-markdown";
};

// A description or a comment as formatted text. `renderMarkdown` strips
// every script, event handler, and unsafe URL before the HTML is set.
export function ReadOnlyMarkdown({ markdown, className, formatClassName = "markdown" }: ReadOnlyMarkdownProps) {
	return (
		<div
			className={cx(formatClassName, className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitizes the HTML it returns.
			dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
		/>
	);
}
