// Runs as its own process, so every module under src/ loads for the first
// time here. Counts the timers and the fetches the import of src/index.ts
// starts, lists the packages the import loads from node_modules, and prints
// them as one JSON line.
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

// The last `node_modules/<name>` segment of a loaded path names its package.
const packageName = (path: string) => {
	const segments = [...path.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)];
	return segments.at(-1)?.[1];
};
const packages = [...new Set(Object.keys(require.cache).map(packageName))].filter((name) => name !== undefined);
console.log(JSON.stringify({ timers, fetches, packages }));
