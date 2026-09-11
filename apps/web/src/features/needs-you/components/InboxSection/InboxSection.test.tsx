import { beforeEach, describe, expect, test } from "bun:test";
import userEvent from "@testing-library/user-event";
import type { TicketSummary } from "@trellis/api";
import { useState } from "react";
import { ticketSummary } from "../../../../../test/fixtures";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { InboxSection } from "./InboxSection";

beforeEach(() => localStorage.clear());

const rows = [
	ticketSummary({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6T1", identifier: "CDE-42", title: "Restore the export pages" }),
	ticketSummary({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6T2", identifier: "CDE-37", title: "Notes+ tabs survive a restart" }),
	ticketSummary({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6T3", identifier: "TRL-9", title: "PR polling" }),
] as TicketSummary[];

// The section with the open state the header toggles.
function Harness({ focusedId }: { focusedId?: string }) {
	const [open, setOpen] = useState(true);
	return (
		<InboxSection
			name="Review"
			total={3}
			open={open}
			onToggle={() => setOpen((value) => !value)}
			rows={rows}
			focusedId={focusedId ?? rows[1]!.identifier}
		/>
	);
}

describe("InboxSection", () => {
	// NY-43. The header is the control that opens and closes the section, so
	// a screen reader reads its state and Enter works on it.
	test("exposes the header as a button with aria-expanded", async () => {
		const user = userEvent.setup();
		const { getByRole, queryByText } = renderWithProviders(<Harness />, { path: "/needs-you", actor: "navid" });
		const header = getByRole("button", { name: /^Review/ });
		expect(header.getAttribute("aria-expanded")).toBe("true");
		expect(queryByText("Restore the export pages")).not.toBeNull();
		header.focus();
		await user.keyboard("{Enter}");
		expect(getByRole("button", { name: /^Review/ }).getAttribute("aria-expanded")).toBe("false");
		expect(queryByText("Restore the export pages")).toBeNull();
	});

	// NY-55. One tab stop per section: Tab reaches the section, and j and k
	// move inside it.
	test("renders a grid with a roving tabindex", () => {
		const { getByRole, getAllByRole } = renderWithProviders(<Harness />, { path: "/needs-you", actor: "navid" });
		expect(getByRole("grid")).toBeDefined();
		const gridRows = getAllByRole("row");
		expect(gridRows).toHaveLength(3);
		const tabIndexes = gridRows.map((element) => element.getAttribute("tabindex"));
		expect(tabIndexes).toEqual(["-1", "0", "-1"]);
	});
});
