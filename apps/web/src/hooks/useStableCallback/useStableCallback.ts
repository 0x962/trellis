import { useCallback, useRef } from "react";

// A function whose identity never changes and whose body is the latest
// render's. A memoized row keeps its props between renders of the table.
export const useStableCallback = <Args extends unknown[], Result>(callback: (...args: Args) => Result) => {
	const latest = useRef(callback);
	latest.current = callback;
	return useCallback((...args: Args) => latest.current(...args), []);
};
