import { BUDGET_FACTOR, PERF_ROWS } from "./seed.ts";

// ARCHITECTURE.md, Performance budgets: the `tickets.list` p95 for the default
// table query is 5 ms at 1k, 10 ms at 10k, and 20 ms at 50k.
export const LIST_BUDGET_MS = PERF_ROWS <= 1_000 ? 5 : PERF_ROWS <= 10_000 ? 10 : 20;

// The 95th percentile of `samples`, in the unit the samples carry.
export const percentile95 = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.95) - 1] as number;
};

// The 99th percentile of `samples`, in the unit the samples carry.
export const percentile99 = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.99) - 1] as number;
};

// The 95th percentile of `runs` timed calls, in milliseconds, after three
// untimed calls warm the plan cache. The budget table is p95.
export const p95 = async (fn: () => Promise<unknown>, runs = 50) => {
	for (let i = 0; i < 3; i++) await fn();
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		await fn();
		samples.push(performance.now() - start);
	}
	return percentile95(samples);
};

// The p95 of `runs` values that `fn` returns, after three untimed calls. A
// Server-Timing test returns the db duration of each response.
export const p95Of = async (fn: () => Promise<number>, runs = 50) => {
	for (let i = 0; i < 3; i++) await fn();
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) samples.push(await fn());
	return percentile95(samples);
};

// The budget on this machine: the reference figure times the factor
// `TRELLIS_PERF_FACTOR` sets. CI sets 2.5.
export const budget = (value: number) => value * BUDGET_FACTOR;

// Prints one measurement beside its budget, so a passing run still shows
// how much room is left.
export const report = (metric: string, measured: number, limit: number, unit = "ms") => {
	console.log(`perf: ${metric} = ${Math.round(measured * 10) / 10} ${unit} (budget ${limit} ${unit})`);
	return measured;
};
