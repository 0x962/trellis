import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rowOf, seededReview } from "../../../test/inbox";
import { renderApp } from "../../../test/renderWithProviders";
import { createTestServer } from "../../../test/server";

beforeEach(() => localStorage.clear());

// TRL-27. The landing page lists the inbox rows. It holds no approval
// control, so a ticket shortcut moves nothing and opens no panel.
for (const path of ["/needs-you", "/needs-you?peek=CDE-42"]) {
	test(`${path} lists the inbox rows and ignores ticket shortcuts`, async () => {
		const server = createTestServer();
		renderApp({ path, actor: "dana", server });
		const heading = await screen.findByRole("heading", { name: "Needs you" });
		expect(heading.textContent).toBe("Needs you");
		await rowOf(seededReview[0]!);
		expect(document.querySelectorAll("[data-inbox-row]").length).toBeGreaterThan(0);
		expect(screen.queryByRole("dialog")).toBeNull();
		for (const name of ["Review", "Failing checks", "Stalled", "Done by agents today"]) {
			expect(screen.getByRole("region", { name })).toBeDefined();
		}
		expect(screen.getByRole("link", { name: "Needs you" }).textContent).toBe("Needs you");
		await userEvent.setup().keyboard("arjk{Enter}");
		expect(server.callsTo("tickets.move")).toHaveLength(0);
		expect(server.callsTo("inbox.get").length).toBeGreaterThan(0);
		expect(document.title).toBe("Needs you · trellis");
	});
}
