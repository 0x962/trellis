type IdleCallback = () => void;

// happy-dom has no requestIdleCallback. This installs one that only records
// the callback; the test runs it when the browser would.
export const captureIdle = () => {
	const target = window as unknown as { requestIdleCallback?: unknown };
	const original = target.requestIdleCallback;
	const callbacks: IdleCallback[] = [];
	target.requestIdleCallback = (callback: IdleCallback) => {
		callbacks.push(callback);
		return callbacks.length;
	};
	return {
		callbacks,
		restore: () => {
			target.requestIdleCallback = original;
		},
	};
};
