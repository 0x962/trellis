import { expect, test } from "@playwright/test";
import { patch } from "./api";
import { createTicket, ensureProject, trellis } from "./cli";
import { signIn } from "./support";

const shortRenderedComment = `[Short link](https://example.com/${"a".repeat(750)})`;
const longRenderedComment = Array.from({ length: 12 }, (_, index) => `Paragraph ${index + 1}`).join("\n\n");

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
});

test("a long comment renders its full body", async ({ page }) => {
	await signIn(page, "/t/CMT-2");
	const body = page.getByRole("article", { name: "Comment by dana" }).locator(".markdown, .comment-markdown");
	await expect(body.getByText("Paragraph 12")).toBeVisible();
	await expect
		.poll(() => body.evaluate((element) => element.parentElement!.clientHeight === element.parentElement!.scrollHeight))
		.toBe(true);
});

test("timeline actor names align with the comment surface", async ({ page }) => {
	await signIn(page, "/t/CMT-1");
	const comment = page.getByRole("article", { name: "Comment by dana" });
	const surface = comment.locator("[data-thread-surface]");
	const commentName = comment.getByText("dana", { exact: true });
	const activityName = page.locator('[data-kind="activity"]').getByText("claude-code", { exact: true });
	const [surfaceBox, commentNameBox, activityNameBox] = await Promise.all([
		surface.boundingBox(),
		commentName.boundingBox(),
		activityName.boundingBox(),
	]);
	expect(surfaceBox).not.toBeNull();
	expect(commentNameBox).not.toBeNull();
	expect(activityNameBox).not.toBeNull();
	expect(commentNameBox!.x).toBeCloseTo(surfaceBox!.x, 0);
	expect(activityNameBox!.x).toBeCloseTo(surfaceBox!.x, 0);
});

test("every activity item renders as its own timeline row", async ({ page }) => {
	await signIn(page, "/t/CMT-3");
	await expect(page.locator('[data-stream-entry="activity"]')).toHaveCount(103);
});
