import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Select } from "./Select";

const items = ["none", "low", "medium", "high", "urgent"].map((value) => ({ value, label: value }));

const highlighted = () => {
	const option = screen.getByRole("listbox").querySelector("[role=option][data-highlighted]")!;
	return screen.getAllByRole("option").indexOf(option as HTMLElement);
};

describe("Select", () => {
	test("trigger is a named combobox showing the value", () => {
		render(<Select label="Priority" items={items} value="low" onValueChange={() => {}} />);
		const trigger = screen.getByRole("combobox", { name: "Priority" });
		expect(trigger.textContent).toContain("low");
		expectClasses(trigger, "h-7 rounded-md border-border bg-surface");
	});

	test("arrow keys move the highlight and Enter selects", async () => {
		const user = userEvent.setup();
		const onValueChange = mock();
		render(<Select label="Priority" items={items} value="low" onValueChange={onValueChange} />);
		const trigger = screen.getByRole("combobox", { name: "Priority" });
		trigger.focus();
		await user.keyboard("{ArrowDown}");
		const listbox = await screen.findByRole("listbox");
		expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(items.map((item) => item.label));
		await waitFor(() => expect(listbox.querySelector("[data-highlighted]")).not.toBeNull());
		const start = highlighted();
		await user.keyboard("{ArrowDown}");
		const second = highlighted();
		expect(second).toBe(start + 1);
		await user.keyboard("{ArrowDown}");
		const third = highlighted();
		expect(third).toBe(second + 1);
		await user.keyboard("{Enter}");
		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(onValueChange.mock.calls[0]![0]).toBe(items[third]!.value);
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
	});

	test("Escape closes and disabled does not open", async () => {
		const user = userEvent.setup();
		render(
			<>
				<Select label="Priority" items={items} value="low" onValueChange={() => {}} />
				<Select label="Locked" items={items} value="low" onValueChange={() => {}} disabled />
			</>,
		);
		const trigger = screen.getByRole("combobox", { name: "Priority" });
		trigger.focus();
		await user.keyboard("{ArrowDown}");
		await screen.findByRole("listbox");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());

		const locked = screen.getByRole("combobox", { name: "Locked" });
		expect(locked.getAttribute("aria-disabled")).toBe("true");
		await user.click(locked);
		expect(screen.queryByRole("listbox")).toBeNull();
	});
});
