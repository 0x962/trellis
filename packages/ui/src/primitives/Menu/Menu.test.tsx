import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu } from "./Menu";

const setup = () => {
	const user = userEvent.setup();
	const onSelect = { Edit: mock(), Duplicate: mock(), Delete: mock() };
	render(
		<Menu
			label="Actions"
			items={[
				{ label: "Edit", onSelect: onSelect.Edit },
				{ label: "Duplicate", onSelect: onSelect.Duplicate },
				{ label: "Delete", onSelect: onSelect.Delete, disabled: true },
			]}
		/>,
	);
	return { user, onSelect, trigger: screen.getByRole("button", { name: "Actions" }) };
};

const focusedIndex = () => screen.getAllByRole("menuitem").indexOf(document.activeElement as HTMLElement);

describe("Menu", () => {
	test("opens a menu with menuitems and reflects a disabled item", async () => {
		const { user, trigger } = setup();
		expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
		await user.click(trigger);
		await screen.findByRole("menu");
		const items = screen.getAllByRole("menuitem");
		expect(items.map((item) => item.textContent)).toEqual(["Edit", "Duplicate", "Delete"]);
		expect(items[2]!.getAttribute("aria-disabled")).toBe("true");
	});

	test("arrow keys move focus and Enter selects", async () => {
		const { user, onSelect, trigger } = setup();
		await user.click(trigger);
		await screen.findByRole("menu");
		await user.keyboard("{ArrowDown}");
		await waitFor(() => expect(focusedIndex()).toBeGreaterThanOrEqual(0));
		const first = focusedIndex();
		await user.keyboard("{ArrowDown}");
		const second = focusedIndex();
		expect(second).toBe(first + 1);
		await user.keyboard("{ArrowUp}");
		expect(focusedIndex()).toBe(first);
		const label = screen.getAllByRole("menuitem")[first]!.textContent as keyof typeof onSelect;
		await user.keyboard("{Enter}");
		expect(onSelect[label]).toHaveBeenCalledTimes(1);
		for (const other of Object.keys(onSelect).filter((name) => name !== label)) {
			expect(onSelect[other as keyof typeof onSelect]).not.toHaveBeenCalled();
		}
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
	});

	test("Escape closes the menu", async () => {
		const { user, trigger } = setup();
		await user.click(trigger);
		await screen.findByRole("menu");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		expect(document.activeElement).toBe(trigger);
	});
});
