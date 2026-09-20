import { cx } from "../../utils/cx";

export type OutputBlockProps = {
	// What a command printed, or what an agent wrote. The block prints the
	// text without a change, and it keeps every line break.
	text: string;
	// A Tailwind maximum height class. Text above that height scrolls inside
	// the block, so a long text never pushes the rest of the page down.
	maxHeight?: string;
	className?: string;
};

export function OutputBlock({ text, maxHeight = "max-h-80", className }: OutputBlockProps) {
	return (
		<pre
			className={cx(
				"min-w-0 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-fg-muted",
				maxHeight,
				className,
			)}
		>
			{text}
		</pre>
	);
}
