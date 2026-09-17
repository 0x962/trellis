import { expect, type Locator, test } from "@playwright/test";
import type { SessionDetail } from "@trellis/api";
import { del, post } from "./api";
import { signIn } from "./support";

// A command that stays alive and echoes its input, so the session has a
// live terminal and no real agent program runs.
const cat = {
	preset: "custom",
	startCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
	resumeCommand: "/bin/sh -c 'stty -echoctl; exec /bin/cat'",
};

// The left edge of one element, which says which of two elements the
// reader meets first on a left-to-right line.
const leftEdge = async (element: Locator) => (await element.boundingBox())!.x;

// The size and weight the browser draws for one element.
const typeOf = (element: Locator) =>
	element.evaluate((node) => {
		const style = getComputedStyle(node);
		return { fontSize: style.fontSize, fontWeight: style.fontWeight };
	});

// The same session with its agent reported as working. isAgentWorking
// needs all four of these fields, and only then does the mark animate.
const asWorking = (detail: SessionDetail): SessionDetail => {
	const now = new Date().toISOString();
	return {
		...detail,
		run: {
			...detail.run,
			processStatus: "running",
			observation: {
				checkedAt: now,
				controllable: true,
				activity: { state: "working", updatedAt: now },
				outcome: null,
				turnId: null,
			},
		},
	};
};

test("the session title draws the static mark before the name in the title type", async ({ page }) => {
	const session = await post<SessionDetail>("/sessions", {
		name: "e2e static title",
		prompt: "Wait for input.",
		harness: cat,
	});
	try {
		await page.setViewportSize({ width: 1280, height: 800 });
		await signIn(page, `/sessions/${session.id}`);
		const topbar = page.locator("[data-page-topbar]");
		const heading = topbar.getByRole("heading", { level: 1, name: "e2e-static-title" });
		const mark = topbar.getByRole("img", { name: "e2e-static-title · agent", exact: true });
		await expect(heading).toBeVisible();
		await expect(mark).toBeVisible();
		await expect(topbar.locator('svg[data-state="static"]')).toHaveCount(1);
		await expect(topbar.locator('svg[data-state="working"]')).toHaveCount(0);
		expect(await leftEdge(mark)).toBeLessThan(await leftEdge(heading));
		expect(await typeOf(heading)).toEqual({ fontSize: "16px", fontWeight: "600" });
	} finally {
		await del(`/sessions/${session.id}`);
	}
});

test("a working session title draws the working mark before the name", async ({ page }) => {
	const session = await post<SessionDetail>("/sessions", {
		name: "e2e working title",
		prompt: "Wait for input.",
		harness: cat,
	});
	try {
		// The page reads the session every two seconds, so this answer
		// reaches it even when the first read travels in a batch.
		await page.route("**/rpc/sessions/get*", (route) => route.fulfill({ json: { json: asWorking(session) } }));
		await page.setViewportSize({ width: 1280, height: 800 });
		await signIn(page, `/sessions/${session.id}`);
		const topbar = page.locator("[data-page-topbar]");
		const heading = topbar.getByRole("heading", { level: 1, name: "e2e-working-title" });
		const mark = topbar.getByRole("img", { name: "e2e-working-title · agent · working", exact: true });
		await expect(heading).toBeVisible();
		await expect(mark).toBeVisible();
		await expect(topbar.locator('svg[data-state="working"]')).toHaveCount(1);
		expect(await leftEdge(mark)).toBeLessThan(await leftEdge(heading));
		expect(await typeOf(heading)).toEqual({ fontSize: "16px", fontWeight: "600" });
	} finally {
		await page.unroute("**/rpc/sessions/get*");
		await del(`/sessions/${session.id}`);
	}
});
