import { expect, type Page, test } from "@playwright/test";
import { get, inbox, statusOf } from "./api";
import { createTicket, ensureProject, moveTicket } from "./cli";
import { signIn } from "./support";

test.beforeAll(() => {
	ensureProject("APR", "Approve");
});

// An agent finishes work and hands it to a person: the CLI moves the ticket
// to Human Review as `agent:claude-code`.
const createReviewTickets = (count: number) => {
	const identifiers: string[] = [];
	for (let index = 0; index < count; index += 1) {
		const ticket = createTicket("APR", `Approve run ${Date.now()}-${index}`);
		moveTicket(ticket.identifier, "human-review");
		identifiers.push(ticket.identifier);
	}
	return identifiers;
};

// Moves every ticket out of the other sections as a person, so the empty
// state is one approval run away.
const clearNonReviewSections = async () => {
	const current = await inbox();
	for (const section of [current.failingCi, current.stalled, current.doneByAgentsToday]) {
		for (const item of section.items) moveTicket(item.identifier, "todo", "human:navid");
	}
};

const rowIn = (page: Page, identifier: string) => page.locator(`[data-inbox-row="${identifier}"]`);

test("approve > a ticket the CLI moves to Human Review shows in Needs you, and a approves it", async ({ page }) => {
	const [identifier] = createReviewTickets(1);
	await signIn(page, "/needs-you");
	const row = rowIn(page, identifier!);
	await expect(row).toBeVisible();
	await row.focus();
	await page.keyboard.press("a");
	await expect(row).toHaveCount(0);
	// The row leaves before the move commits, so the status is polled.
	await expect.poll(() => statusOf(identifier!)).toBe("Done");
});

// E2E-01. Ten keystrokes clear the screen, which is the whole point of the
// home screen.
test("approve > clears ten review rows with ten a presses", async ({ page }) => {
	await clearNonReviewSections();
	const before = (await inbox()).review.total;
	const created = createReviewTickets(10);
	await signIn(page, "/needs-you");
	const rows = page.locator("[data-inbox-row]");
	await expect(rows).toHaveCount(before + 10);
	await rows.first().focus();
	for (let press = 0; press < before + 10; press += 1) await page.keyboard.press("a");
	// The empty page states the fact as its heading (spec D14).
	await expect(page.getByRole("heading", { name: "Nothing needs you" })).toBeVisible();
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(sidebar.getByRole("link", { name: /Needs you/ })).not.toContainText(/\d/);
	for (const identifier of created) expect(await statusOf(identifier)).toBe("Done");
});

// E2E-02. The comment is what the agent reads next.
test("approve > send back posts the comment and moves the ticket", async ({ page }) => {
	const [identifier] = createReviewTickets(1);
	await signIn(page, "/needs-you");
	const row = rowIn(page, identifier!);
	await row.focus();
	await page.keyboard.press("r");
	const box = page.getByRole("textbox", { name: /Reason to send back/i });
	await box.fill("Fix the migration");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(row).toHaveCount(0);
	const timeline = await get<{ items: { kind: string; body?: string }[] }>(`/tickets/${identifier}/timeline`);
	expect(timeline.items.some((item) => item.kind === "comment" && item.body === "Fix the migration")).toBe(true);
	expect(await statusOf(identifier!)).toBe("In Progress");
});
