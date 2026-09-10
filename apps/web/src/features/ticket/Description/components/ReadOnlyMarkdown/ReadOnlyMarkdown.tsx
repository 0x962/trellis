import { cx, Dialog } from "@trellis/ui";
import { type MouseEvent, useMemo, useState } from "react";
import { renderMarkdown } from "../../../../../lib/markdown";

export type ReadOnlyMarkdownProps = {
	markdown: string;
	className?: string;
	formatClassName?: "markdown" | "comment-markdown";
};

type Shown = { src: string; alt: string };

const imageClass = "[&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md [&_img]:border [&_img]:border-border";

// A description or a comment as formatted text. `renderMarkdown` strips
// every script, event handler, and unsafe URL before the HTML is set. An
// image, such as a pasted attachment, fits the column and opens large in a
// lightbox on click.
export function ReadOnlyMarkdown({ markdown, className, formatClassName = "markdown" }: ReadOnlyMarkdownProps) {
	const [shown, setShown] = useState<Shown | null>(null);

	// React writes the inner HTML again whenever the object under
	// `dangerouslySetInnerHTML` is a new one, which replaces every rendered
	// node. One object per text keeps the nodes across a repaint, so a
	// selection holds and an image keeps its pixels.
	const html = useMemo(() => ({ __html: renderMarkdown(markdown) }), [markdown]);

	const onClick = (event: MouseEvent) => {
		const target = event.target as HTMLElement;
		if (!(target instanceof HTMLImageElement)) return;
		event.stopPropagation();
		setShown({ src: target.getAttribute("src") ?? "", alt: target.alt });
	};

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the lightbox is a larger view of an image the text already shows */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the lightbox is a larger view of an image the text already shows */}
			<div
				onClick={onClick}
				className={cx(formatClassName, imageClass, className)}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitizes the HTML it returns.
				dangerouslySetInnerHTML={html}
			/>
			{shown !== null && (
				<Dialog open title={shown.alt} onOpenChange={(open) => !open && setShown(null)} className="w-auto max-w-full">
					<img src={shown.src} alt={shown.alt} className="max-h-[80vh] max-w-full rounded-md object-contain" />
				</Dialog>
			)}
		</>
	);
}
