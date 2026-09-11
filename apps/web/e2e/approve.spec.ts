import { expect, test } from "@playwright/test";
import { statusOf } from "./api";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { signIn } from "./support";

test("review tickets stay off Needs you and have no approval actions", async ({ page }) => {
	ensureProject("APR", "Review controls");
	const ticket = createTicket("APR", `Review ticket ${Date.now()}`);
	moveTicket(ticket.identifier, "human-review");
	await signIn(page, "/needs-you");
	await expect(page.getByRole("heading", { name: "Needs you", exact: true })).toBeVisible();
	await expect(page.locator("[data-inbox-row]")).toHaveCount(0);
	await page.keyboard.press("a");
	expect(await statusOf(ticket.identifier)).toBe("Human Review");
	await page.goto(`/t/${ticket.identifier}`);
	await expect(page.getByLabel("Properties").getByText("Human Review")).toBeVisible();
	await expect(page.getByRole("button", { name: /^Approve|^Send back/ })).toHaveCount(0);
	await page.keyboard.press("a");
	await page.keyboard.press("r");
	expect(await statusOf(ticket.identifier)).toBe("Human Review");
});
