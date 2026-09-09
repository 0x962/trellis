import { beforeEach, describe, expect, test } from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import { mockMatchMedia } from "../../../test/media";
import { useTheme } from "./useTheme";

let api: ReturnType<typeof useTheme>;
let second: ReturnType<typeof useTheme>;

function Probe() {
	api = useTheme();
	return null;
}

function SecondProbe() {
	second = useTheme();
	return null;
}

const stamp = () => document.documentElement.getAttribute("data-theme");

describe("useTheme", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute("data-theme");
		document.documentElement.removeAttribute("data-theme-switch");
	});

	test("every consumer on the page sees one choice", () => {
		mockMatchMedia(false);
		render(
			<>
				<Probe />
				<SecondProbe />
			</>,
		);
		act(() => api.setTheme("dark"));
		expect(second.mode).toBe("dark");
		expect(second.resolved).toBe("dark");
		expect(stamp()).toBe("dark");
	});

	// The plan never animates a theme switch. Every control carries a color
	// transition for hover, so the switch turns transitions off while the
	// palette swaps, through a data-theme-switch attribute on <html>.
	test("a theme switch holds data-theme-switch on html while the palette swaps", async () => {
		mockMatchMedia(false);
		render(<Probe />);
		act(() => api.setTheme("dark"));
		expect(document.documentElement.hasAttribute("data-theme-switch")).toBe(true);
		expect(stamp()).toBe("dark");
		await waitFor(() => expect(document.documentElement.hasAttribute("data-theme-switch")).toBe(false));
		expect(stamp()).toBe("dark");
	});

	test("stamps data-theme for light and dark and removes it for system", () => {
		mockMatchMedia(false);
		render(<Probe />);
		expect(stamp()).toBeNull();
		expect(api.mode).toBe("system");
		act(() => api.setTheme("dark"));
		expect(stamp()).toBe("dark");
		expect(localStorage.getItem("trellis-theme")).toBe("dark");
		act(() => api.setTheme("light"));
		expect(stamp()).toBe("light");
		expect(localStorage.getItem("trellis-theme")).toBe("light");
		act(() => api.setTheme("system"));
		expect(stamp()).toBeNull();
		expect(localStorage.getItem("trellis-theme")).toBe("system");
	});

	test("resolved theme follows the system preference", () => {
		const media = mockMatchMedia(true);
		render(<Probe />);
		expect(media.matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
		expect(api.mode).toBe("system");
		expect(api.resolved).toBe("dark");
		media.fire(false);
		expect(api.resolved).toBe("light");
	});
});
