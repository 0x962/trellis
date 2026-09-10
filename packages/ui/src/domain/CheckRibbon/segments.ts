// A GitHub check outcome. `cancel` counts as a failure in the CI state.
export type CheckBucket = "pass" | "fail" | "cancel" | "pending" | "skipping";

export type Check = {
	name: string;
	bucket: CheckBucket;
};

export type RibbonSize = "full" | "mini";

// The word a person reads for each bucket. A bucket name is GitHub's
// identifier, and a tooltip never shows it raw.
export const outcomeWords: Record<CheckBucket, string> = {
	pass: "passed",
	fail: "failed",
	cancel: "canceled",
	pending: "pending",
	skipping: "skipped",
};

// One drawn piece of a ribbon: one check, or one run of checks in one bucket.
export type RibbonSegment = {
	bucket: CheckBucket;
	// The tooltip: the check name and its outcome, or the run length and its outcome.
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

// The exact width in px of one segment when every check gets its own
// segment. That holds up to one check per px of the box, so the width is at
// least 1 px. The ribbon draws that width in whole hundredths of a px.
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

// Splits `sum` whole units over `weights` in proportion, by the largest
// remainder method. Every part is its exact share rounded down. The units
// still missing go one each to the parts with the largest remainders. A tie
// keeps weight order, so equal weights differ by at most one unit.
const apportion = (sum: number, weights: readonly number[]) => {
	const whole = total(weights);
	const shares = weights.map((weight) => (weight * sum) / whole);
	const parts = shares.map(Math.floor);
	const order = shares
		.map((share, index) => ({ index, remainder: share - parts[index]! }))
		.sort((a, b) => b.remainder - a.remainder);
	for (const { index } of order.slice(0, sum - total(parts))) parts[index]! += 1;
	return parts;
};

// The widths of the runs of a crowded ribbon in hundredths of a px, in run
// order. Every run starts at its share of the box by length. A pinned run
// under 100 rises to 100, and the widest free run pays each hundredth of
// the rise. When the free runs cannot pay, they drop to 0 and the pinned
// runs share the box in proportion. The widths always add up to the box.
const runWidths = (box: number, merged: readonly Run[]) => {
	const isPinned = (index: number) => pinned(merged[index]!.bucket);
	const shares = apportion(
		box * 100,
		merged.map((run) => run.length),
	);
	const widths = shares.map((share, index) => (isPinned(index) ? Math.max(100, share) : share));
	const supply = total(widths.filter((_, index) => !isPinned(index)));
	const deficit = total(widths) - box * 100;
	if (supply < deficit)
		return apportion(
			box * 100,
			widths.map((width, index) => (isPinned(index) ? width : 0)),
		);
	for (let paid = 0; paid < deficit; paid += 1) {
		let widest = -1;
		widths.forEach((width, index) => {
			if (!isPinned(index) && (widest < 0 || width > widths[widest]!)) widest = index;
		});
		widths[widest]! -= 1;
	}
	return widths;
};

// The segments of a ribbon, in check order. Up to one check per px of the
// box, every check is a segment of `segmentWidth`. Those widths are whole
// hundredths of a px that add up to the box. Above that, each run of one
// bucket is a segment, sized by `runWidths`.
export const ribbonSegments = (size: RibbonSize, checks: readonly Check[]): RibbonSegment[] => {
	const box = ribbonWidths[size];
	if (checks.length <= box) {
		const room = (box - (checks.length - 1) * ribbonGap(size, checks.length)) * 100;
		const widths = apportion(
			room,
			checks.map(() => 1),
		);
		return checks.map((check, index) => ({
			bucket: check.bucket,
			title: `${check.name}: ${outcomeWords[check.bucket]}`,
			width: widths[index]! / 100,
		}));
	}
	const merged = runs(checks);
	const widths = runWidths(box, merged);
	return merged.map((run, index) => ({
		bucket: run.bucket,
		title:
			run.length === 1
				? `${run.name}: ${outcomeWords[run.bucket]}`
				: `${run.length} checks: ${outcomeWords[run.bucket]}`,
		width: widths[index]! / 100,
	}));
};
