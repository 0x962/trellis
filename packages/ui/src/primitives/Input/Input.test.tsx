import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expectClasses } from "../../../test/classes";
import { Input } from "./Input";

// A controlled input needs a parent that stores each keystroke, or the value
// never changes and the second keystroke lands on an empty field.
function Controlled({ onChange }: { onChange: (value: string) => void }) {
	const [value, setValue] = useState("");
	return (
		<Input
			label="Title"
			value={value}
			onChange={(event) => {
				setValue(event.target.value);
				onChange(event.target.value);
			}}
		/>
	);
}

describe("Input", () => {
	test("labeled textbox with token classes and focus-visible outline", async () => {
		const user = userEvent.setup();
		const onChange = mock();
		render(<Controlled onChange={onChange} />);
		const input = screen.getByRole("textbox", { name: "Title" });
		await user.type(input, "ab");
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(onChange).toHaveBeenLastCalledWith("ab");
		expectClasses(input, "h-8 rounded-md border-border bg-surface text-base");
		expectClasses(
			input,
			"outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft",
		);
	});

	// The accent border and the soft ring mark the focus. An outline on top of
	// the border would draw a second ring.
	test("the focus draws no outline over the border", () => {
		render(<Input label="Title" value="" onChange={() => {}} />);
		expect(screen.getByRole("textbox", { name: "Title" }).className).not.toMatch(/focus-visible:outline-2/);
	});

	test("reflects disabled and invalid", () => {
		render(
			<>
				<Input label="Off" disabled value="" onChange={() => {}} />
				<Input label="Bad" invalid value="" onChange={() => {}} />
			</>,
		);
		const off = screen.getByRole("textbox", { name: "Off" });
		expect(off.hasAttribute("disabled")).toBe(true);
		expectClasses(off, "disabled:opacity-50");
		const bad = screen.getByRole("textbox", { name: "Bad" });
		expect(bad.getAttribute("aria-invalid")).toBe("true");
		expectClasses(bad, "border-danger");
	});
});
