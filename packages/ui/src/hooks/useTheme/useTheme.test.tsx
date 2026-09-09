import { beforeEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { mockMatchMedia } from "../../../test/media";
import { useTheme } from "./useTheme";

let api: ReturnType<typeof useTheme>;

function Probe() {
	api = useTheme();
	return null;
}

const stamp = () => document.documentElement.getAttribute("data-theme");

describe("useTheme", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute("data-theme");
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
