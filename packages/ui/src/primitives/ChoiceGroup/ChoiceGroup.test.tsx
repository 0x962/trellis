import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expectFocusRing } from "../../../test/classes";
import { ChoiceGroup } from "./ChoiceGroup";

describe("ChoiceGroup", () => {
	test("shows descriptions and changes the selected choice with the keyboard", async () => {
		const user = userEvent.setup();
		const onValueChange = mock();
		render(
			<ChoiceGroup
				label="Review type"
				value="comment"
				onValueChange={onValueChange}
				options={[
					{ value: "comment", label: "Comment", description: "Submit general feedback." },
					{ value: "approve", label: "Approve", description: "Approve merging these changes." },
				]}
			/>,
		);
		expect(screen.getByRole("radiogroup", { name: "Review type" })).toBeTruthy();
		expect(screen.getByText("Submit general feedback.")).toBeTruthy();
		const comment = screen.getByRole("radio", { name: /Comment/ });
		const approve = screen.getByRole("radio", { name: /Approve/ });
		expect(comment.getAttribute("aria-checked")).toBe("true");
		expectFocusRing(comment);
		comment.focus();
		await user.keyboard("{ArrowDown}");
		expect(onValueChange).toHaveBeenCalledWith("approve");
		expect(approve.getAttribute("aria-checked")).toBe("false");
	});
});
