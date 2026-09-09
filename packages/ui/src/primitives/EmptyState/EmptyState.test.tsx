import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
	test("empty state renders icon, title, description, and action", () => {
		const { container } = render(
			<EmptyState
				icon={<Inbox />}
				title="Nothing needs you"
				description="Every review is done and every check is green."
				action={<Button>New ticket</Button>}
			/>,
		);
		screen.getByRole("heading", { name: "Nothing needs you" });
		expectClasses(screen.getByText("Every review is done and every check is green."), "text-fg-muted");
		const empty = container.firstElementChild!;
		expect(empty.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
		screen.getByRole("button", { name: "New ticket" });
		expectClasses(empty, "py-10 text-center text-fg-muted");
	});
});
