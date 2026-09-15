import { expect, test } from "@playwright/test";
import { statusOf } from "./api";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { signIn } from "./support";

// TRL-27. The ticket page of a review ticket carries no approval control, and
// the a and r keys leave the status as it is.
test("a review ticket has no approval actions", async ({ page }) => {
	ensureProject("APR", "Review controls");
	const ticket = createTicket("APR", `Review ticket ${Date.now()}`);
	moveTicket(ticket.identifier, "human-review");
	await signIn(page, `/t/${ticket.identifier}`);
	await expect(page.getByLabel("Properties").getByText("Human Review")).toBeVisible();
	await expect(page.getByRole("button", { name: /^Approve|^Send back/ })).toHaveCount(0);
	await page.keyboard.press("a");
	await page.keyboard.press("r");
	expect(await statusOf(ticket.identifier)).toBe("Human Review");
});
