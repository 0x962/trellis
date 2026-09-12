import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { Button } from "../Button";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
	test("the header is a 28 px row with the title, the count, and the actions on the right", () => {
		const { container } = render(
			<SectionHeader title="Sub-tickets" count="3/5" actions={<Button variant="quiet">New sub-ticket</Button>} />,
		);
		const row = container.firstElementChild!;
		expectClasses(row, "flex h-7 items-center gap-2");
		const heading = screen.getByRole("heading", { level: 2, name: /Sub-tickets/ });
		expectClasses(screen.getByText("Sub-tickets"), "text-base font-medium text-fg");
		const count = screen.getByText("(3/5)");
		expect(count.textContent).toBe("(3/5)");
		expectClasses(count, "text-sm text-fg-faint tabular");
		expect(heading.textContent).not.toContain("·");
		const actions = screen.getByRole("button", { name: "New sub-ticket" }).parentElement!;
		expectClasses(actions, "ml-auto flex items-center gap-2 text-sm text-fg-faint");
	});

	test("a header with no count and no actions shows the title only", () => {
		render(<SectionHeader title="Timeline" level={3} />);
		const heading = screen.getByRole("heading", { level: 3, name: "Timeline" });
		expect(heading.textContent).toBe("Timeline");
	});
});
