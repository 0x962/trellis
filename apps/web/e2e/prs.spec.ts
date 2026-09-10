import { expect, test } from "@playwright/test";
import { createTicket, ensureProject, trellis } from "./cli";
import { failingPrUrl } from "./ghReplies";
import { signIn } from "./support";

// PRS-2 is the child of PRS-1 and links the pull request that the gh stub
// answers with one failing check. This file sorts after needs-you.spec.ts,
// so the Failing CI section of that spec holds only its own ticket.
test.beforeAll(() => {
	if (!ensureProject("PRS", "Pull requests")) return;
	createTicket("PRS", "Ship the typecheck fix");
	createTicket("PRS", "Land the desktop typecheck", ["--parent", "PRS-1"]);
	trellis(["pr", "add", "PRS-2", failingPrUrl]);
});

test("prs > a linked pull request shows its row, and its parent shows the failing CI", async ({ page }) => {
	await signIn(page, "/t/PRS-2");
	const row = page.locator("[data-pr-row]");
	await expect(row).toContainText("Fix the desktop typecheck");
	await expect(row).toContainText("#7");
	await page.goto("/t/PRS-1");
	const children = page.getByRole("region", { name: /Sub-tickets/ });
	await expect(children.getByLabel(/ PR, checks failed/)).toBeVisible();
});

// The route below answers as margin, so the test needs no margin on this
// machine and no network.
test("prs > Show diff frames the margin page beside the ticket", async ({ page }) => {
	await page.route(/^http:\/\/margin\.localhost\//, (route) =>
		route.fulfill({ contentType: "text/html", body: "<p>the margin page</p>" }),
	);
	await signIn(page, "/t/PRS-2");
	await page.getByRole("button", { name: "Show diff" }).click();
	const panel = page.getByRole("dialog", { name: "acme/web #7" });
	await expect(panel).toBeVisible();
	await expect(panel.locator("iframe")).toHaveAttribute("src", `http://margin.localhost/${failingPrUrl}`);
	await expect(panel.frameLocator("iframe").getByText("the margin page")).toBeVisible();
	expect((await panel.boundingBox())?.width).toBe(1240);
	await panel.getByRole("button", { name: "Close" }).click();
	await expect(panel).toBeHidden();
});
