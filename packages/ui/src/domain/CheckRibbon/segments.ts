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

// A failed or canceled run is pinned: it takes 1 px before a free run takes any.
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

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);

const round = (value: number) => Math.round(value * 100) / 100;

// Rounds `widths` to 0.01 px so they still add up to `sum`. Rounding each
// width alone drifts the total by up to 0.005 px per width; the widest
// width takes the drift, and it is far wider than the drift.
const settle = (widths: readonly number[], sum: number) => {
	const rounded = widths.map(round);
	const drift = round(sum - total(rounded));
	const widest = rounded.indexOf(Math.max(...rounded));
	rounded[widest] = round(rounded[widest]! + drift);
	return rounded;
};

// The px widths of the runs of a crowded ribbon, in run order. Every run
// starts at its share of the box by length. A pinned run under 1 px rises
// to 1 px, and the free runs pay the difference in proportion to their
// length. When the free runs cannot pay, they drop to 0 and the pinned
// runs shrink in proportion, so the widths always add up to the box.
const runWidths = (box: number, count: number, merged: readonly Run[]) => {
	const share = box / count;
	const raised = merged.map((run) => (pinned(run.bucket) ? Math.max(1, run.length * share) : run.length * share));
	const isFree = (index: number) => !pinned(merged[index]!.bucket);
	const free = total(raised.filter((_, index) => isFree(index)));
	const deficit = total(raised) - box;
	if (free >= deficit) return raised.map((width, index) => (isFree(index) ? width - deficit * (width / free) : width));
	const scale = box / (total(raised) - free);
	return raised.map((width, index) => (isFree(index) ? 0 : width * scale));
};

// The segments of a ribbon, in check order. Up to one check per px of the
// box, every check is a segment of one equal width. Above that, each run of
// one bucket is a segment, sized by `runWidths` and rounded to 0.01 px.
export const ribbonSegments = (size: RibbonSize, checks: readonly Check[]): RibbonSegment[] => {
	const box = ribbonWidths[size];
	if (checks.length <= box) {
		const width = segmentWidth(size, checks.length);
		return checks.map((check) => ({ bucket: check.bucket, title: `${check.name}: ${check.bucket}`, width }));
	}
	const merged = runs(checks);
	const widths = settle(runWidths(box, checks.length, merged), box);
	return merged.map((run, index) => ({
		bucket: run.bucket,
		title: run.length === 1 ? `${run.name}: ${run.bucket}` : `${run.length} checks: ${run.bucket}`,
		width: widths[index]!,
	}));
};
