// The 95th percentile of `runs` timed calls, in milliseconds, after three
// untimed calls warm the plan cache. The budget table of plan.md is p95.
export const p95 = async (fn: () => Promise<unknown>, runs = 50) => {
	for (let i = 0; i < 3; i++) await fn();
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		await fn();
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	return samples[Math.ceil(samples.length * 0.95) - 1] as number;
};
