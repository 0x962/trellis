import { beforeEach, describe, expect, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { themeStorageKey } from "@trellis/ui";
import { mockMatchMedia } from "../../../../test/media";
import { type createHarness, renderWithProviders } from "../../../../test/renderWithProviders";
import { createTestServer } from "../../../../test/server";
import { ThemeField } from "./ThemeField";

beforeEach(() => {
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.removeAttribute("data-theme-switch");
	mockMatchMedia(false);
});

const render = (harness?: ReturnType<typeof createHarness>) =>
	renderWithProviders(<ThemeField />, {
		path: "/settings",
		actor: "dana",
		server: createTestServer(),
		...(harness === undefined ? {} : { harness }),
	});

const control = () => screen.findByRole("combobox", { name: "Theme" });

const pick = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
	await user.click(await control());
	await user.click(await screen.findByRole("option", { name: label }));
};

// Every attribute name the html element gained or lost, in order.
const watchAttributes = () => {
	const seen: string[] = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) seen.push(record.attributeName ?? "");
	});
	observer.observe(document.documentElement, { attributes: true });
	return { seen, stop: () => observer.disconnect() };
};

describe("ThemeField", () => {
	// ST-12. Dark is the default, and a first run never paints light first.
	test("starts at dark on a first run", async () => {
		render();
		const user = userEvent.setup();
		await waitFor(() => expect(localStorage.getItem(themeStorageKey)).toBe("dark"));
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		expect((await control()).textContent).toBe("Dark");
		await user.click(await control());
		expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
			"System",
			"Light",
			"Dark",
		]);
	});

	// ST-13. The palette swaps in one frame, and no control fades with it.
	test("switches to light without animating the swap", async () => {
		const user = userEvent.setup();
		render();
		const watch = watchAttributes();
		await pick(user, "Light");
		watch.stop();
		await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
		expect(localStorage.getItem(themeStorageKey)).toBe("light");
		expect(watch.seen).toContain("data-theme-switch");
	});

	// ST-14. System means the operating system decides, so nothing is stamped.
	test("clears the stamp for the system theme", async () => {
		const user = userEvent.setup();
		render();
		await pick(user, "System");
		await waitFor(() => expect(document.documentElement.hasAttribute("data-theme")).toBe(false));
		expect(localStorage.getItem(themeStorageKey)).toBe("system");
	});

	// ST-15
	test("keeps the chosen theme across a remount", async () => {
		const user = userEvent.setup();
		const first = render();
		await pick(user, "Light");
		await waitFor(() => expect(localStorage.getItem(themeStorageKey)).toBe("light"));
		first.unmount();
		render();
		expect((await control()).textContent).toBe("Light");
		expect(document.documentElement.getAttribute("data-theme")).toBe("light");
	});
});
