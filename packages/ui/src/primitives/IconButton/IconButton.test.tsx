import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshCw } from "lucide-react";
import { expectClasses } from "../../../test/classes";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
	test("square button named by its label, keyboard operable, reflects disabled", async () => {
		const user = userEvent.setup();
		const onClick = mock();
		const { rerender } = render(<IconButton label="Refresh" icon={<RefreshCw />} onClick={onClick} />);
		const button = screen.getByRole("button", { name: "Refresh" });
		expect(button.getAttribute("aria-label")).toBe("Refresh");
		expectClasses(button, "size-7 rounded-md");
		expectClasses(button, "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2");
		expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
		button.focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onClick).toHaveBeenCalledTimes(2);

		rerender(<IconButton label="Refresh" icon={<RefreshCw />} onClick={onClick} disabled />);
		expect(button.hasAttribute("disabled")).toBe(true);
		await user.click(button);
		expect(onClick).toHaveBeenCalledTimes(2);
	});
});
