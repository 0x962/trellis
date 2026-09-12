import { expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PowerToggle } from "./PowerToggle";

test("the power icon identifies the toggle and its state is accessible", async () => {
	const onChange = mock();
	const user = userEvent.setup();
	const { rerender } = render(<PowerToggle label="Agents" on={false} onChange={onChange} />);
	const button = screen.getByRole("button", { name: "Agents", pressed: false });
	expect(button.querySelector("svg")).not.toBeNull();
	button.focus();
	await user.keyboard(" ");
	expect(onChange).toHaveBeenLastCalledWith(true);
	rerender(<PowerToggle label="Agents" on onChange={onChange} />);
	expect(screen.getByRole("button", { name: "Agents", pressed: true })).toBe(button);
	await user.keyboard("{Enter}");
	expect(onChange).toHaveBeenLastCalledWith(false);
	rerender(<PowerToggle label="Agents" on onChange={onChange} disabled />);
	await user.click(button);
	expect(onChange).toHaveBeenCalledTimes(2);
});
