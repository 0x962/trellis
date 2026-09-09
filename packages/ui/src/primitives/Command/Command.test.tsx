import { describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Command } from "./Command";

const items = [
	{ id: "CDE-1", label: "First" },
	{ id: "TRL-4", label: "Poller" },
];

describe("Command", () => {
	test("typing filters the command items", async () => {
		const user = userEvent.setup();
		render(<Command items={items} onSelect={() => {}} />);
		const input = screen.getByRole("combobox");
		screen.getByRole("listbox");
		expect(screen.getAllByRole("option")).toHaveLength(2);
		await user.type(input, "po");
		await waitFor(() => expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Poller"]));
	});

	test("arrow keys move the selection and Enter selects", async () => {
		const user = userEvent.setup();
		const onSelect = mock();
		render(<Command items={items} onSelect={onSelect} />);
		const input = screen.getByRole("combobox");
		input.focus();
		await user.keyboard("{ArrowDown}");
		await waitFor(() => expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true"));
		await user.keyboard("{Enter}");
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect.mock.calls[0]![0]).toBe("TRL-4");
	});

	test("two items with one label stay two options and Enter picks the highlighted one", async () => {
		const user = userEvent.setup();
		const onSelect = mock();
		render(
			<Command
				items={[
					{ id: "CDE-1", label: "Fix flaky test" },
					{ id: "TRL-4", label: "Fix flaky test" },
				]}
				onSelect={onSelect}
			/>,
		);
		screen.getByRole("combobox").focus();
		await user.keyboard("{ArrowDown}");
		await waitFor(() =>
			expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-selected"))).toEqual([
				"false",
				"true",
			]),
		);
		await user.keyboard("{Enter}");
		expect(onSelect.mock.calls).toEqual([["TRL-4"]]);
	});

	test("the label still matches the filter when the id is the value", async () => {
		const user = userEvent.setup();
		render(<Command items={[{ id: "CDE-1", label: "Poller", keywords: ["gh"] }]} onSelect={() => {}} />);
		await user.type(screen.getByRole("combobox"), "poll");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
		await user.clear(screen.getByRole("combobox"));
		await user.type(screen.getByRole("combobox"), "gh");
		await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
	});

	test("the command dialog closes on Escape", async () => {
		const user = userEvent.setup();
		const onOpenChange = mock();
		render(
			<Command.Dialog open onOpenChange={onOpenChange}>
				<Command items={items} onSelect={() => {}} />
			</Command.Dialog>,
		);
		const dialog = screen.getByRole("dialog");
		expect(dialog.contains(screen.getByRole("combobox"))).toBe(true);
		expectClasses(dialog, "bg-elevated rounded-lg shadow-lg border-border");
		expectClasses(dialog, "motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100");
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange.mock.calls[0]![0]).toBe(false);
	});
});
