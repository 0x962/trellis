import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectClasses } from "../../../test/classes";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
	test("labeled textarea, keyboard input, disabled, focus-visible", async () => {
		const user = userEvent.setup();
		const onChange = mock();
		const { rerender } = render(<Textarea label="Comment" rows={3} onChange={onChange} />);
		const textarea = screen.getByRole("textbox", { name: "Comment" });
		expect(textarea.tagName).toBe("TEXTAREA");
		expect(textarea.getAttribute("rows")).toBe("3");
		await user.type(textarea, "hi");
		expect(onChange).toHaveBeenCalledTimes(2);
		expectClasses(textarea, "rounded-md border-border text-base leading-5");
		expectClasses(textarea, "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2");

		rerender(<Textarea label="Comment" rows={3} onChange={onChange} disabled />);
		expect(textarea.hasAttribute("disabled")).toBe(true);
		await user.type(textarea, "x");
		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
