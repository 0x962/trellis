// A GitHub check outcome. `cancel` counts as a failure in the CI state.
export type CheckBucket = "pass" | "fail" | "cancel" | "pending" | "skipping";

export type Check = {
	name: string;
	bucket: CheckBucket;
};

export type RibbonSize = "wide" | "full" | "mini";

// The word a person reads for each bucket. A bucket name is GitHub's
// identifier, and a tooltip never shows it raw.
export const outcomeWords: Record<CheckBucket, string> = {
	pass: "passed",
	fail: "failed",
	cancel: "canceled",
	pending: "pending",
	skipping: "skipped",
};

// One drawn piece of a ribbon: one check or one group of adjacent checks.
export type RibbonSegment = {
	bucket: CheckBucket;
	// The width in px. The widths and the gaps of one ribbon add up to the box width.
	width: number;
};

// The ribbon box widths in px: `w-48`, `w-16`, and `w-8` with the 4 px spacing token.
export const ribbonWidths: Record<RibbonSize, number> = { wide: 192, full: 64, mini: 32 };

// The gap stays visible when the ribbon groups more checks than it can draw.
export const ribbonGap = (size: RibbonSize, count: number) => {
	if (size === "mini" || count > 16) return 1;
	return 2;
};

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

const severity: Record<CheckBucket, number> = {
	pass: 0,
	skipping: 1,
	pending: 2,
	cancel: 3,
	fail: 4,
};

const worstBucket = (checks: readonly Check[]): CheckBucket =>
	checks.reduce((worst, check) => (severity[check.bucket] > severity[worst] ? check.bucket : worst), checks[0]!.bucket);

const outcomeOrder: readonly CheckBucket[] = ["fail", "cancel", "pending", "pass", "skipping"];

export const checkCountWords = (checks: readonly Check[]) =>
	outcomeOrder
		.map((bucket) => ({ bucket, count: checks.filter((check) => check.bucket === bucket).length }))
		.filter(({ count }) => count > 0)
		.map(({ bucket, count }) => `${count} ${outcomeWords[bucket]}`)
		.join(", ");

const groupedChecks = (checks: readonly Check[], count: number) =>
	Array.from({ length: count }, (_, index) =>
		checks.slice(Math.floor((index * checks.length) / count), Math.floor(((index + 1) * checks.length) / count)),
	);

// Every segment keeps at least 1 px of width and a visible gap. A crowded
// ribbon groups adjacent checks into the maximum number of segments that fit.
// The worst outcome gives a group its color, so a failure stays visible.
export const ribbonSegments = (size: RibbonSize, checks: readonly Check[]): RibbonSegment[] => {
	const box = ribbonWidths[size];
	const gap = ribbonGap(size, checks.length);
	const capacity = Math.floor((box + gap) / (1 + gap));
	const groups = groupedChecks(checks, Math.min(checks.length, capacity));
	const room = (box - (groups.length - 1) * gap) * 100;
	const widths = apportion(
		room,
		groups.map(() => 1),
	);
	return groups.map((group, index) => ({
		bucket: worstBucket(group),
		width: widths[index]! / 100,
	}));
};
