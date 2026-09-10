import { cx } from "@trellis/ui";
import { renderMarkdown } from "../../../lib/markdown";

export type ReadOnlyMarkdownProps = {
	markdown: string;
	className?: string;
};

// A description or a comment as formatted text. `renderMarkdown` strips
// every script, event handler, and unsafe URL before the HTML is set.
export function ReadOnlyMarkdown({ markdown, className }: ReadOnlyMarkdownProps) {
	return (
		<div
			className={cx("markdown", className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitizes the HTML it returns.
			dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
		/>
	);
}
