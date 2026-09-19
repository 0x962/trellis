import type { CheckStatus } from "../checkStatus";

export type CheckRingCounts = Partial<Record<CheckStatus, number>>;

const order: CheckStatus[] = ["failed", "running", "pending", "canceled", "unknown", "neutral", "skipped", "success"];

export function ringSegments(counts: CheckRingCounts) {
	const present = order.flatMap((status) => (counts[status] ? [{ status, count: counts[status]! }] : []));
	let remaining = 100;
	let total = present.reduce((sum, segment) => sum + segment.count, 0);
	// A minimum share keeps one failed check visible among hundreds of skipped checks.
	const minimum = 7;
	const sizes = new Map<CheckStatus, number>();
	for (const segment of [...present].sort((a, b) => a.count - b.count)) {
		const size = Math.max(minimum, (segment.count / total) * remaining);
		sizes.set(segment.status, size);
		remaining -= size;
		total -= segment.count;
	}
	let offset = 0;
	const gap = present.length > 1 ? 5 : 0;
	return present.map((segment) => {
		const size = sizes.get(segment.status)!;
		const start = offset + gap / 2;
		offset += size;
		return { ...segment, start, length: size - gap };
	});
}
