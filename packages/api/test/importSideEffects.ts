// Runs as its own process, so every module under src/ loads for the first
// time here. Counts the timers and the fetches the import of src/index.ts
// starts and prints the counts as one JSON line.
let timers = 0;
let fetches = 0;
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((callback: () => void, delay?: number) => {
	timers += 1;
	return originalSetTimeout(callback, delay);
}) as typeof setTimeout;
globalThis.fetch = (() => {
	fetches += 1;
	return Promise.resolve(new Response());
}) as unknown as typeof fetch;

await import("../src/index.ts");
console.log(JSON.stringify({ timers, fetches }));
