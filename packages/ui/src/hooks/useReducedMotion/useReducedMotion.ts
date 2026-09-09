import { useMediaQuery } from "../useMediaQuery";

// Whether the person asked the system for less motion. CSS handles most of
// it through `motion-reduce:`; this is for motion driven from JavaScript.
export function useReducedMotion() {
	return useMediaQuery("(prefers-reduced-motion: reduce)");
}
