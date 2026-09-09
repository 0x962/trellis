import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expectClasses, expectFocusRing } from "../../../test/classes";
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
