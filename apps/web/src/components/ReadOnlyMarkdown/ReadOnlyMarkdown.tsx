import { cx, Dialog } from "@trellis/ui";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { renderMarkdown } from "../../lib/markdown";
import { drawMermaidBlocks } from "./drawMermaidBlocks";
import { imageForViewer, type ViewerImage } from "./imageForViewer/imageForViewer.ts";

export type ReadOnlyMarkdownProps = {
	markdown: string;
	className?: string;
	// `render` overrides `renderMarkdown` and must sanitize its output.
	render?: (markdown: string) => string;
};

const imageClass = "[&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-md [&_img]:border [&_img]:border-border";
const diagramClass =
	"[&_.mermaid-diagram]:my-3 [&_.mermaid-diagram]:overflow-x-auto [&_.mermaid-diagram_svg]:max-w-none";

// A description, an epic document, or an agent line as formatted text. `renderMarkdown` strips
// every script, event handler, and unsafe URL before the HTML is set. An
// image, such as a pasted attachment, fits the column and opens large in a
// lightbox on click. A ```mermaid code block draws as its diagram.
export function ReadOnlyMarkdown({ markdown, className, render = renderMarkdown }: ReadOnlyMarkdownProps) {
	const [shown, setShown] = useState<ViewerImage | null>(null);
	const root = useRef<HTMLDivElement>(null);

	// React writes the inner HTML again whenever the object under
	// `dangerouslySetInnerHTML` is a new one, which replaces every rendered
	// node. One object per text keeps the nodes across a repaint, so a
	// selection holds and an image keeps its pixels.
	const html = useMemo(() => ({ __html: render(markdown) }), [markdown, render]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: each new `html` object puts fresh nodes on the page, so the diagrams must draw again.
	useEffect(() => {
		void drawMermaidBlocks(root.current!);
	}, [html]);

	const onClick = (event: MouseEvent) => {
		if (!(event.target instanceof HTMLElement)) return;
		const image = imageForViewer(event.target);
		if (image === null) return;
		event.stopPropagation();
		setShown(image);
	};

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the lightbox is a larger view of an image the text already shows */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the lightbox is a larger view of an image the text already shows */}
			<div
				ref={root}
				onClick={onClick}
				className={cx("markdown", imageClass, diagramClass, className)}
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
