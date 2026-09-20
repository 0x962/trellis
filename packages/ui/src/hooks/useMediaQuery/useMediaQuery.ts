import { useSyncExternalStore } from "react";

// Whether `query` matches now. The value follows the media query list, so a
// system setting that changes while the app runs is seen at once.
export function useMediaQuery(query: string) {
	return useSyncExternalStore(
		(onChange) => {
			const list = window.matchMedia(query);
			list.addEventListener("change", onChange);
			return () => list.removeEventListener("change", onChange);
		},
		() => window.matchMedia(query).matches,
		// A render without a browser has no viewport to measure. It answers
		// "no match", which draws the desktop layout, and the first paint in
		// the browser replaces it.
		() => false,
	);
}
