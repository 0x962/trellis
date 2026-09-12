import { useId } from "react";
import { cx } from "../../utils/cx";

export type TrellisWordmarkProps = {
	// True draws the first two letters alone, for a bar too narrow to hold
	// the whole name.
	short?: boolean;
	// The height, 16 px by default. The width follows the viewBox.
	className?: string;
};

// The product name, cut by vertical stripes. A mask holds the stripes, so
// the letters are the app's own face and the gaps fall on a fixed grid at
// every size. `textLength` pins the word to the viewBox, so a machine that
// falls back to another face still draws the same box and nothing beside
// the mark shifts.
const width = 104;
// "tr" takes two of the seven letters, plus the side bearing the full word
// carries, so the short box is a shade under a third of the long one.
const shortWidth = 32;
const height = 24;
// One stripe every 3 units, 1.8 of them ink. A narrower gap closes up at
// 16 px tall and the word reads as a solid block.
const pitch = 3;
const ink = 1.8;

export function TrellisWordmark({ short = false, className = "h-4" }: TrellisWordmarkProps) {
	const box = short ? shortWidth : width;
	// A mask is addressed by url(#id), and a raw useId holds colons, which
	// that reference cannot carry.
	const id = useId().replaceAll(":", "");
	return (
		<svg viewBox={`0 0 ${box} ${height}`} role="img" aria-label="trellis" className={cx("w-auto shrink-0", className)}>
			<defs>
				<pattern id={`${id}-stripes`} width={pitch} height={height} patternUnits="userSpaceOnUse">
					<rect width={ink} height={height} fill="white" />
				</pattern>
				<mask id={`${id}-mask`}>
					<rect width={box} height={height} fill={`url(#${id}-stripes)`} />
				</mask>
			</defs>
			<text
				x="0"
				y="19"
				textLength={box}
				lengthAdjust="spacingAndGlyphs"
				fontSize="22"
				fontWeight="600"
				mask={`url(#${id}-mask)`}
				className="fill-fg"
			>
				{short ? "tr" : "trellis"}
			</text>
		</svg>
	);
}
