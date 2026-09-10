import { expect, test } from "@playwright/test";
import { apiUrl } from "./env";
import { signIn } from "./support";

// The e2e server binds 127.0.0.1, so a phone cannot reach it. The settings
// page says so and shows the one command that opens the server to the network.
test("settings on a loopback server shows the command that pairs a phone", async ({ page, request }) => {
	const health = await (await request.get(`${apiUrl}/api/health`)).json();
	expect(health.addresses).toEqual([apiUrl]);

	await signIn(page, "/settings");
	const row = page.locator("[data-settings-row]", { hasText: "Pair a phone" });

	await expect(row.getByText("trellis install --host 0.0.0.0")).toBeVisible();
	await expect(row.getByText(/no sign-in/i)).toBeVisible();
	await expect(row.getByRole("img", { name: /QR code/i })).toHaveCount(0);
});
