import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expectClasses, expectFocusRing, expectHitArea } from "../../../test/classes";
import { Tabs } from "./Tabs";

const items = [
	{ value: "All", label: "All", content: <p>Everything</p> },
	{ value: "Activity", label: "Activity", disabled: true, content: <p>Moves</p> },
	{ value: "Comments", label: "Comments", content: <p>Only comments</p> },
];

function Controlled() {
	const [value, setValue] = useState("All");
	return <Tabs items={items} value={value} onValueChange={setValue} />;
}

const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")!;

describe("Tabs", () => {
	test("tablist, tabs, and panel with selected styling", () => {
		render(<Tabs items={items.slice(0, 1).concat(items.slice(2))} value="All" onValueChange={() => {}} />);
		screen.getByRole("tablist");
		const tabs = screen.getAllByRole("tab");
		expect(tabs).toHaveLength(2);
		expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
		const all = screen.getByRole("tab", { name: "All" });
		expect(all.getAttribute("aria-selected")).toBe("true");
		expectClasses(all, "text-fg border-b-2 border-accent");
		expectFocusRing(all);
		expectClasses(screen.getByRole("tab", { name: "Comments" }), "text-fg-muted");
	});

	// A short label such as "All" is narrower than 28 px. On a fine pointer
	// the layer alone gives the width, so the underline hugs the label. On a
	// coarse pointer the tab's min-width gives 44 px and the layer the height.
	test("every tab reaches the 28 px and 44 px hit areas and hugs its label", () => {
		render(<Tabs items={items} value="All" onValueChange={() => {}} />);
		for (const tab of screen.getAllByRole("tab")) {
			expectHitArea(tab, "tab32");
			expectClasses(tab, "pointer-coarse:min-w-11 justify-center");
			expect(Array.from(tab.classList).filter((name) => name.includes("min-w"))).toEqual(["pointer-coarse:min-w-11"]);
		}
	});

	// Base UI renders the panel with tabindex="0", so Tab lands on it after
	// the tab strip. A stop with no ring is invisible to a keyboard user.
	test("the panel is a keyboard stop that draws the focus ring", () => {
		render(<Tabs items={items} value="All" onValueChange={() => {}} />);
		const panel = screen.getByRole("tabpanel");
		expect(panel.getAttribute("tabindex")).toBe("0");
		expectFocusRing(panel);
	});

	test("arrow, Home, and End keys move the selection and skip a disabled tab", async () => {
		const user = userEvent.setup();
		render(<Controlled />);
		expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-disabled")).toBe("true");
		screen.getByRole("tab", { name: "All" }).focus();
		await user.keyboard("{ArrowRight}");
		await waitFor(() => expect(selected().textContent).toBe("Comments"));
		await user.keyboard("{ArrowLeft}");
		await waitFor(() => expect(selected().textContent).toBe("All"));
		await user.keyboard("{End}");
		await waitFor(() => expect(selected().textContent).toBe("Comments"));
		await user.keyboard("{Home}");
		await waitFor(() => expect(selected().textContent).toBe("All"));
	});
});
