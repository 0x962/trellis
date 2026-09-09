import { beforeEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { themeStorageKey } from "@trellis/ui";
import { mockMatchMedia } from "../../test/media";
import { toggleTheme, useTheme } from "./theme";

function Probe() {
	const { mode, resolved } = useTheme();
	return (
		<output>
			{mode}/{resolved}
		</output>
	);
}

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	mockMatchMedia(false);
});

describe("lib/theme", () => {
	// WS-23. Dark is the default: the web hook starts dark on an empty
	// profile, where the ui hook alone would start in system mode.
	test("useTheme starts dark on first run", () => {
		render(<Probe />);
		expect(screen.getByRole("status").textContent).toBe("dark/dark");
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	});

	// WS-24. The ui hook's key is the one key the theme writes, so the head
	// script and every hook read one value.
	test("toggleTheme flips between dark and light through the ui hook's key", () => {
		render(<Probe />);
		act(() => toggleTheme());
		expect(screen.getByRole("status").textContent).toBe("light/light");
		expect(localStorage.getItem(themeStorageKey)).toBe("light");
		expect(document.documentElement.getAttribute("data-theme")).toBe("light");
		act(() => toggleTheme());
		expect(screen.getByRole("status").textContent).toBe("dark/dark");
		expect(localStorage.getItem(themeStorageKey)).toBe("dark");
		expect(localStorage.length).toBe(1);
		expect(localStorage.key(0)).toBe(themeStorageKey);
	});
});
