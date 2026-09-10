import { beforeEach, describe, expect, test } from "bun:test";
import { within } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { openPalette, palette, renderShell, resetStores, section } from "../../../../test/palette";

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
		const hint = within(palette()).getByText(/to jump to a ticket/);
		expect(hint.textContent).toBe("Type TRL-12 to jump to a ticket");
	});

	// The sidebar names a project by its name under its parents' names. A
	// project row leads with those names, and its mono sub is the ref the
	// CLI takes.
	test("a project row leads with the names the sidebar shows", async () => {
		await renderShell({ path: "/needs-you" });
		await openPalette();
		const row = within(section("Go to")).getByRole("option", { name: /Superset CDE \/ web/ });
		expect(row.firstElementChild!.nextElementSibling!.textContent).toBe("Superset CDE / web");
		const ref = within(row).getByText("CDE.web");
		expect(ref.className).toContain("font-mono");
	});
});
