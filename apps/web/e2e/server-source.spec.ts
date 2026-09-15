import { expect, test } from "@playwright/test";
import { apiUrl } from "./env";
import { signIn } from "./support";

// An install from another checkout replaces the running server. The settings
// page names the checkout and the commit that `/api/health` reports, so a
// person sees which tree the server runs.
test("settings shows the checkout and the commit of the running server", async ({ page, request }) => {
	const health = await (await request.get(`${apiUrl}/api/health`)).json();

	await signIn(page, "/settings#server");
	const row = page.locator("[data-settings-row]", { hasText: "Running server" });

	await expect(row.getByText(health.source.checkout)).toBeVisible();
	await expect(row.getByText(health.source.commit)).toBeVisible();
});
