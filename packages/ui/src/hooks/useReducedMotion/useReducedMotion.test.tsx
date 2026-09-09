import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { mockMatchMedia } from "../../../test/media";
import { useReducedMotion } from "./useReducedMotion";

let reduced: boolean;

function Probe() {
	reduced = useReducedMotion();
	return null;
}

describe("useReducedMotion", () => {
	test("follows the reduced-motion media query", () => {
		const media = mockMatchMedia(false);
		const { unmount } = render(<Probe />);
		expect(media.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
		expect(reduced).toBe(false);
		media.fire(true);
		expect(reduced).toBe(true);
		expect(media.listeners.size).toBeGreaterThan(0);
		unmount();
		expect(media.listeners.size).toBe(0);
	});
});
