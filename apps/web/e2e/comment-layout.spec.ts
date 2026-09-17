import { expect, test } from "@playwright/test";
import { patch } from "./api";
import { createTicket, ensureProject, trellis } from "./cli";
import { signIn } from "./support";

const shortRenderedComment = `[Short link](https://example.com/${"a".repeat(750)})`;
const longRenderedComment = Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}`).join("\n\n");

type CliComment = { id: string; parentId: string | null };

test.beforeAll(async () => {
	if (!ensureProject("CMT", "Comment layout")) return;
	createTicket("CMT", "Keep compact comments compact");
	trellis(["comment", "CMT-1", "--body", shortRenderedComment], "human:dana");
	createTicket("CMT", "Expand a long comment");
	trellis(["comment", "CMT-2", "--body", longRenderedComment], "human:dana");
	createTicket("CMT", "Show every activity item");
	trellis(["edit", "CMT-3", "--title", "Show every activity item after one edit"]);
	trellis(["edit", "CMT-3", "--title", "Show every activity item after two edits"]);
	for (let index = 0; index < 100; index += 1) {
		await patch(`/tickets/CMT-3`, { title: `Show every activity item after edit ${index + 3}` });
	}
	createTicket("CMT", "Delete one comment");
	trellis(["comment", "CMT-4", "--body", "This comment goes away."], "human:dana");
	createTicket("CMT", "Align a resolved thread");
	trellis(["comment", "CMT-5", "--body", "This thread can close."], "human:dana");
	createTicket("CMT", "Nest a reply under its thread");
	const root = trellis<CliComment>(["comment", "CMT-6", "--body", "The root question."], "human:dana");
	trellis(["comment", "CMT-6", "--reply-to", root.id, "--body", "The nested answer."], "human:dana");
});

test("activity collapses to the last few rows with an expander", async ({ page }) => {
	await signIn(page, "/t/CMT-3");
	const rows = page.locator('[data-kind="activity"]');
	await expect(rows).toHaveCount(3);
	await page.getByRole("button", { name: "Show all activity" }).click();
	await expect(rows).toHaveCount(103);
	await page.getByRole("button", { name: "Show less" }).click();
	await expect(rows).toHaveCount(3);
});

test("comments render after the activity section without cards", async ({ page }) => {
	await signIn(page, "/t/CMT-1");
	const activity = page.locator('section[aria-label="Activity"]');
	const comments = page.locator('section[aria-label="Comments"]');
	await expect(activity).toBeVisible();
	await expect(comments).toBeVisible();
	const order = await page.evaluate(() => {
		const names = [...document.querySelectorAll("section[aria-label]")].map((element) =>
			element.getAttribute("aria-label"),
		);
		return [names.indexOf("Activity"), names.indexOf("Comments")];
	});
	expect(order[0]).toBeGreaterThanOrEqual(0);
	expect(order[1]).toBeGreaterThan(order[0]!);
	await expect(comments.locator("[data-thread-surface]")).toHaveCount(0);
	await expect(page.getByRole("article", { name: "Comment by dana" })).toBeVisible();
});

test("a long comment folds with a show-more control", async ({ page }) => {
	await signIn(page, "/t/CMT-2");
	const comment = page.getByRole("article", { name: "Comment by dana" });
	const body = comment.locator("[data-comment-body]");
	await expect(comment.getByRole("button", { name: "Show more" })).toBeVisible();
	const folded = await body.evaluate((element) => element.getBoundingClientRect().height);
	expect(folded).toBeLessThanOrEqual(280);
	await comment.getByRole("button", { name: "Show more" }).click();
	await expect(comment.getByText("Paragraph 12")).toBeVisible();
	await expect(comment.getByRole("button", { name: "Show less" })).toBeVisible();
	await comment.getByRole("button", { name: "Show less" }).click();
	const refolded = await body.evaluate((element) => element.getBoundingClientRect().height);
	expect(refolded).toBeLessThanOrEqual(280);
});

test("a resolved thread control aligns with its thread", async ({ page }) => {
	await signIn(page, "/t/CMT-5");
	const comment = page.getByRole("article", { name: "Comment by dana" });
	const commentBox = await comment.boundingBox();
	expect(commentBox).not.toBeNull();

	await comment.getByRole("button", { name: "Comment actions" }).click();
	await page.getByRole("menuitem", { name: "Resolve thread" }).click();
	const resolved = page.getByRole("button", { name: /Resolved thread/ });
	await expect(resolved).toBeVisible();
	const resolvedBox = await resolved.boundingBox();
	expect(resolvedBox).not.toBeNull();
	expect(resolvedBox!.x).toBeCloseTo(commentBox!.x, 0);
});

test("replies nest under their thread root", async ({ page }) => {
	await signIn(page, "/t/CMT-6");
	const thread = page.getByRole("group", { name: "Thread started by dana" });
	await expect(thread.getByRole("article", { name: "Comment by dana" })).toHaveCount(2);
	await expect(thread.getByText("The root question.")).toBeVisible();
	await expect(thread.getByText("The nested answer.")).toBeVisible();
	await expect(thread.getByRole("textbox", { name: "Reply" })).toBeVisible();
});

// The mentioned thread has its own section above the activity. The
// comments section leaves that thread out, so the reader reads the comment
// one time on the page.
test("the comments section leaves out the mentioned thread", async ({ page }) => {
	const comments = trellis<CliComment[]>(["comments", "CMT-6"], "human:dana");
	const rootId = comments.find((comment) => comment.parentId === null)!.id;
	await signIn(page, `/t/CMT-6?thread=${rootId}`);
	await expect(page.getByRole("region", { name: "Mentioned comment" })).toContainText("The root question.");
	await expect(page.locator('section[aria-label="Comments"]').getByText("The root question.")).toHaveCount(0);
});

test("timeline actor names align with the comment headers", async ({ page }) => {
	await signIn(page, "/t/CMT-1");
	const commentName = page.getByRole("article", { name: "Comment by dana" }).getByText("dana", { exact: true });
	const activityName = page.locator('[data-kind="activity"]').getByText("claude-code", { exact: true });
	const [commentNameBox, activityNameBox] = await Promise.all([commentName.boundingBox(), activityName.boundingBox()]);
	expect(commentNameBox).not.toBeNull();
	expect(activityNameBox).not.toBeNull();
	expect(commentNameBox!.x).toBeCloseTo(activityNameBox!.x, 0);
});

// A delete is permanent, so the comment menu asks first. Cancel keeps the
// comment.
test("a comment delete asks for a confirm, and the confirm removes the comment", async ({ page }) => {
	await signIn(page, "/t/CMT-4");
	const comment = page.getByRole("article", { name: "Comment by dana" });
	await expect(comment).toBeVisible();

	await comment.getByRole("button", { name: "Comment actions" }).click();
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Delete this comment?" });
	await expect(dialog).toContainText("trellis cannot restore a deleted comment.");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(comment).toBeVisible();

	await comment.getByRole("button", { name: "Comment actions" }).click();
	await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
	await page
		.getByRole("dialog", { name: "Delete this comment?" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	await expect(comment).toHaveCount(0);
});
