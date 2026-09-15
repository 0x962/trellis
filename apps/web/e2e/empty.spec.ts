import { expect, test } from "@playwright/test";
import { type CliTicket, ensureProject, runPasted } from "./cli";
import { rowOf, signIn } from "./support";

test.beforeAll(() => {
	ensureProject("EMP", "Empty");
	ensureProject("EPO", "Empty poster");
});

// EPO never gets a ticket, so its table always shows the empty state. The
// CLI line test in this file creates EMP-1, so this test cannot use EMP.
test("empty > an empty project, an unknown URL, and Search show one poster", async ({ page }) => {
	const poster = page.locator('main img[alt=""]');
	await signIn(page, "/p/EPO/table");
	await expect(page.getByText("No tickets yet")).toBeVisible();
	const src = await poster.getAttribute("src");
	expect(src).toContain("poster");
	await page.goto("/no-such-page");
	await expect(page.getByText("Page not found")).toBeVisible();
	await expect(poster).toHaveAttribute("src", src!);
	await page.goto("/search");
	await expect(poster).toHaveAttribute("src", src!);
});

// The empty state of a project prints a CLI line. The real CLI parses that
// line, and the line pasted into a shell creates the first ticket.
test("empty > the CLI line of an empty project creates its first ticket", async ({ page }) => {
	await signIn(page, "/p/EMP/table");
	const line = page.getByText(/^trellis create /);
	await expect(line).toHaveText('trellis create -p EMP -t "First ticket"');
	const created = runPasted<CliTicket>((await line.textContent())!);
	expect(created.identifier).toBe("EMP-1");
	await expect(rowOf(page, "EMP-1")).toBeVisible();
});
