import { expect, test } from "@playwright/test";
import { createTicket, ensureProject } from "./cli";
import { signIn } from "./support";

// A description with a task list and a plain list after it.
test.beforeAll(() => {
	if (!ensureProject("MDN", "Markdown")) return;
	createTicket("MDN", "Show a checklist in the description", ["-d", "- [ ] one\n- [x] two\n\nplain\n\n- a\n- b"]);
});

// A task item shows its checkbox as the marker, so it draws no bullet, and
// its list needs no indent for a marker. A plain list keeps both.
test("a description task list shows checkboxes with no bullet and no indent", async ({ page }) => {
	await signIn(page, "/t/MDN-1");
	const markdown = page.locator(".markdown").first();
	const box = markdown.locator('li:has(> input[type="checkbox"])').first();
	await expect(box).toBeVisible();
	const task = await box.evaluate((item) => ({
		marker: getComputedStyle(item).listStyleType,
		indent: getComputedStyle(item.parentElement!).paddingLeft,
	}));
	expect(task).toEqual({ marker: "none", indent: "0px" });
	const plain = await markdown.locator("li", { hasText: /^a$/ }).evaluate((item) => ({
		marker: getComputedStyle(item).listStyleType,
		indent: getComputedStyle(item.parentElement!).paddingLeft,
	}));
	expect(plain).toEqual({ marker: "disc", indent: "24px" });
});
