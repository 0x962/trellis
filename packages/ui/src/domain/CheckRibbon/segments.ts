// A GitHub check outcome. `cancel` counts as a failure in the CI state.
export type CheckBucket = "pass" | "fail" | "cancel" | "pending" | "skipping";

export type Check = {
	name: string;
	bucket: CheckBucket;
};

export type RibbonSize = "full" | "mini";

// One drawn piece of a ribbon: one check, or one run of checks in one bucket.
export type RibbonSegment = {
	bucket: CheckBucket;
	// The tooltip: the check name and its bucket, or the run length and its bucket.
	title: string;
	// The width in px. The widths and the gaps of one ribbon add up to the box width.
	width: number;
};

// The ribbon box widths in px: `w-16` and `w-8` with the 4 px spacing token.
export const ribbonWidths: Record<RibbonSize, number> = { full: 64, mini: 32 };

// The gap in px between segments for a count of checks. A full ribbon keeps
// 2 px gaps up to 16 checks and 1 px gaps up to 32. A mini ribbon keeps 1 px
// gaps up to 16. Above that the segments touch, so the gaps take no width
// from the segments.
export const ribbonGap = (size: RibbonSize, count: number) => {
	if (size === "mini") return count <= 16 ? 1 : 0;
	if (count <= 16) return 2;
	return count <= 32 ? 1 : 0;
};

// The width in px of one segment when every check gets its own segment. That
// holds up to one check per px of the box, so the width is at least 1 px.
export const segmentWidth = (size: RibbonSize, count: number) =>
	(ribbonWidths[size] - (count - 1) * ribbonGap(size, count)) / count;

// A failed or canceled run keeps a 1 px minimum, so it never disappears.
const pinned = (bucket: CheckBucket) => bucket === "fail" || bucket === "cancel";

type Run = { bucket: CheckBucket; name: string; length: number };

// Consecutive checks in one bucket, in order.
const runs = (checks: readonly Check[]) =>
	checks.reduce<Run[]>((result, check) => {
		const last = result[result.length - 1];
		if (last && last.bucket === check.bucket) last.length += 1;
		else result.push({ bucket: check.bucket, name: check.name, length: 1 });
		return result;
	}, []);

// The segments of a ribbon, in check order. Up to one check per px of the
// box, every check is a segment. Above that, each run of one bucket is a
// segment. A run's width is its share of the box by length. A pinned run
// keeps 1 px, and the other runs share the width that remains.
export const ribbonSegments = (size: RibbonSize, checks: readonly Check[]): RibbonSegment[] => {
	const box = ribbonWidths[size];
	if (checks.length <= box) {
		const width = segmentWidth(size, checks.length);
		return checks.map((check) => ({ bucket: check.bucket, title: `${check.name}: ${check.bucket}`, width }));
	}
	const share = box / checks.length;
	const pinnedWidth = (run: Run) => Math.max(1, run.length * share);
	const merged = runs(checks);
	const free = merged.filter((run) => !pinned(run.bucket));
	const freeWidth = box - merged.filter((run) => pinned(run.bucket)).reduce((sum, run) => sum + pinnedWidth(run), 0);
	const freeLength = free.reduce((sum, run) => sum + run.length, 0);
	return merged.map((run) => ({
		bucket: run.bucket,
		title: run.length === 1 ? `${run.name}: ${run.bucket}` : `${run.length} checks: ${run.bucket}`,
		width: pinned(run.bucket) ? pinnedWidth(run) : (run.length / freeLength) * freeWidth,
	}));
};
