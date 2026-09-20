import { cx } from "../../utils/cx";

export type CopyLineProps = {
	// A path or a shell command. A click puts this exact text on the
	// clipboard.
	text: string;
	// "quiet" draws the text a step down, for a line the reader scans rather
	// than reads.
	tone?: "default" | "quiet";
	onCopy: (text: string) => void;
};

// A path or a command is text that the reader takes to a terminal, so the
// line is a button and a click copies it.
export function CopyLine({ text, tone = "default", onCopy }: CopyLineProps) {
	return (
		<button
			type="button"
			aria-label={`Copy ${text}`}
			onClick={() => onCopy(text)}
			className={cx(
				"-mx-1 max-w-full cursor-pointer self-start rounded-sm px-1 py-0.5 text-left font-mono text-xs break-words transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:py-2",
				tone === "quiet" ? "text-fg-muted" : "text-fg",
			)}
		>
			{text}
		</button>
	);
}
