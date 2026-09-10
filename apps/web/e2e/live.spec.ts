import { expect, test } from "@playwright/test";
import { signIn } from "./support";

// The wall clock is shared by both tabs, so `Date.now()` compares across
// them. The observer stamps the moment the rail first shows Done.
const probe = `(() => {
	window.__doneAt = 0;
	new MutationObserver(() => {
		if (window.__doneAt !== 0) return;
		const rail = document.querySelector('[aria-label="Properties"]');
		if (rail !== null && /\\bDone\\b/.test(rail.textContent ?? "")) window.__doneAt = Date.now();
	}).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
})();`;

// WT-107. CDE-42 waits in Human Review. Tab two approves it with `a`; tab
// one sees Done within 100 ms of the commit. The commit time is read when
// the move request settles, so the measured gap is never longer than the
// real one.
test("a live ticket change repaints the ticket page inside the budget", async ({ page, context }) => {
	await page.addInitScript(probe);
	await signIn(page, "/t/CDE-42");
	const rail = page.getByLabel("Properties");
	await expect(rail.getByText("Human Review")).toBeVisible();

	const other = await context.newPage();
	await signIn(other, "/t/CDE-42");
	await expect(other.getByRole("button", { name: /Approve/ })).toBeVisible();
	const settled = other.waitForResponse((response) => /\/rpc\//.test(response.url()) && response.ok());
	await other.keyboard.press("a");
	await settled;
	const committedAt = Date.now();

	await expect(rail.getByText("Done")).toBeVisible();
	const doneAt = await page.evaluate(() => (window as unknown as { __doneAt: number }).__doneAt);
	expect(doneAt).toBeGreaterThan(0);
	expect(doneAt - committedAt).toBeLessThanOrEqual(100);
	await other.close();
});
