import { beforeEach, describe, expect, test } from "bun:test";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockMatchMedia } from "../../../../../media";
import { openPalette, palette, renderShell, resetStores, section } from "../../../../../palette";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	resetStores();
});

describe("features/command/CommandPalette footer and project rows", () => {
	// The footer hint names a key that exists: the root key of the project
	// the route shows.
	test("the footer hint names the root key of the route's project", async () => {
		await renderShell({ path: "/p/TRL" });
		await openPalette();
		const hint = within(palette()).getByText(/to open the ticket/);
		expect(hint.textContent).toBe("Type an ID such as TRL-12 to open the ticket");
	});

	// The sidebar names a project by its name. A project row leads with that
	// name, and its mono sub is the project's path.
	test("a project row leads with the name the sidebar shows", async () => {
		const user = userEvent.setup();
		await renderShell({ path: "/needs-you" });
		await openPalette();
		await user.click(within(section("Go to")).getByRole("option", { name: /Go to project…/ }));
		const row = await within(section("Go to project")).findByRole("option", { name: /CDE\/web/ });
		const name = within(row).getByText("web");
		const ref = within(row).getByText("CDE/web");
		expect(name.compareDocumentPosition(ref) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(ref.className).toContain("font-mono");
	});
});
