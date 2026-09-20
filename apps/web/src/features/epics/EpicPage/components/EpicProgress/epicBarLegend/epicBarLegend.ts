import type { EpicCounts } from "@trellis/api";
import { epicSegments } from "../../../../epicBar";

// `StackedBar` drops a status with a count of zero from its bar and from its
// own legend. This legend keeps every status, so the reader still sees
// "started 0". Example: "done 3 · review 9 · started 0 · todo 15 · canceled 0".
export const epicBarLegend = (counts: EpicCounts): string =>
	epicSegments(counts)
		.map((segment) => `${segment.label.toLowerCase()} ${segment.valueLabel}`)
		.join(" · ");
