import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../../../test/renderWithProviders";
import { createTestServer } from "../../../test/server";

beforeEach(() => localStorage.clear());

for (const path of ["/needs-you", "/needs-you?peek=CDE-42"]) {
	test(`${path} stays empty with review tickets and ignores ticket shortcuts`, async () => {
		const server = createTestServer();
		renderApp({ path, actor: "navid", server });
		const heading = await screen.findByRole("heading", { name: "Needs you" });
		expect(heading.textContent).toBe("Needs you");
		expect(document.querySelector("[data-inbox-row]")).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		for (const name of ["Review", "Failing checks", "Stalled", "Done by agents today"]) {
			expect(screen.queryByRole("button", { name: new RegExp(`^${name}`) })).toBeNull();
		}
		expect(screen.getByRole("link", { name: "Needs you" }).textContent).toBe("Needs you");
		await userEvent.setup().keyboard("arjk{Enter}");
		expect(server.callsTo("tickets.move")).toHaveLength(0);
		expect(server.callsTo("inbox.get")).toHaveLength(0);
		expect(document.title).toBe("Needs you · trellis");
	});
}
