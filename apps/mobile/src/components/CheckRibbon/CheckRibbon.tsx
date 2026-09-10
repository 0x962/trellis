import { View } from "react-native";
import { layout } from "../../theme/layout";
import { type Palette, tokens } from "../../theme/tokens";
import { usePalette } from "../../theme/usePalette";
import { type Check, type CheckBucket, type RibbonSize, ribbonGap, ribbonSegments, ribbonWidths } from "./segments";

export type { Check, CheckBucket };

export type CheckRibbonProps = {
	checks: readonly Check[];
	// `mini` is the 32 px ribbon on a row; `full` is 64 px on a PR card.
	size?: RibbonSize;
};

const buckets: Record<CheckBucket, keyof Palette> = {
	pass: "success",
	fail: "danger",
	cancel: "danger",
	skipping: "warning",
	pending: "borderStrong",
};

// The segments of `ribbonSegments`, in order, colored by bucket. No checks
// means no ribbon. The box keeps its width and clips, so a ribbon never
// reaches its neighbour. A segment is keyed by its position, because GitHub
// check names repeat (one job in two workflows, a matrix re-run).
export function CheckRibbon({ checks, size = "full" }: CheckRibbonProps) {
	const palette = usePalette();
	if (checks.length === 0) return null;
	const count = checks.length === 1 ? "1 check" : `${checks.length} checks`;
	return (
		<View
			testID="check-ribbon"
			accessibilityLabel={count}
			style={{
				flexDirection: "row",
				overflow: "hidden",
				width: ribbonWidths[size],
				height: layout.ribbon[size],
				gap: ribbonGap(size, checks.length),
			}}
		>
			{ribbonSegments(size, checks).map((segment, index) => (
				<View
					// biome-ignore lint/suspicious/noArrayIndexKey: the position is the segment's identity
					key={index}
					testID="ribbon-segment"
					accessibilityLabel={segment.title}
					style={{
						width: segment.width,
						height: "100%",
						borderRadius: tokens.hairline,
						backgroundColor: palette[buckets[segment.bucket]],
					}}
				/>
			))}
		</View>
	);
}
