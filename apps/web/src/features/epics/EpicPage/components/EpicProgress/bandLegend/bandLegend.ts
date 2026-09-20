import type { EpicCounts } from "@trellis/api";
import { epicSegments } from "../../../../epicBar";

// The word legend under the epic bar: "done 3 · review 9 · started 0 · todo
// 15 · canceled 0". It names every segment of `epicSegments` in the order
// the bar draws them. The bar leaves out a status category that holds no
// ticket, so a category at zero reads here and nowhere else.
export const bandLegend = (counts: EpicCounts): string =>
	epicSegments(counts)
		.map((segment) => `${segment.label.toLowerCase()} ${segment.valueLabel}`)
		.join(" · ");
