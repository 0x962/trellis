// Calls `load` when the browser has no other work, so a lazy chunk is in
// the module cache before its first use. The function it returns cancels a
// load that has not started. A browser without requestIdleCallback runs the
// load on the next timer tick.
export const preloadOnIdle = (load: () => Promise<unknown>) => {
	if (typeof requestIdleCallback === "function") {
		const handle = requestIdleCallback(() => void load());
		return () => cancelIdleCallback(handle);
	}
	const handle = setTimeout(() => void load(), 1);
	return () => clearTimeout(handle);
};
