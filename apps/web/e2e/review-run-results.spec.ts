import { expect, test } from "@playwright/test";
import { ensureProject } from "./cli";
import { signIn } from "./support";

test("external review results refresh explicitly and open in Dots", async ({ page }, testInfo) => {
	ensureProject("RVR", "Review results");
	await page.clock.install();
	const requests: string[] = [];
	await page.route("**/rpc/reviews/runs", async (route) => {
		const { action } = route.request().postDataJSON().json;
		requests.push(action);
		const run = { runId: "review-fixture", status: "ok", nodes: [{ id: "check", status: "ok" }] };
		const data =
			action === "list"
				? { runs: [run] }
				: action === "show"
					? run
					: { reply: "Verified review result", stream: "Raw streaming output" };
		await route.fulfill({ json: { json: data } });
	});
	await signIn(page, "/reviews/acme/web/7#runs");
	await page.getByRole("button", { name: /review-f/ }).click();
	await page.getByRole("button", { name: /^check/ }).click();
	await expect(page.getByText("Verified review result", { exact: true })).toBeVisible();
	await expect(page.getByText("Live output", { exact: true })).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Open in Dots", exact: true })).toHaveAttribute(
		"href",
		"http://dots.localhost/runs?g=review&run=review-fixture",
	);
	await page.clock.runFor(2_000);
	const before = requests.length;
	await page.clock.fastForward(15_000);
	expect(requests).toHaveLength(before);
	await page.getByRole("button", { name: "Refresh review results", exact: true }).click();
	await expect.poll(() => requests.length).toBeGreaterThan(before);
	await page.screenshot({ path: testInfo.outputPath("review-results.png") });
});
