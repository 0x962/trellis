import { expect, type Page, test } from "@playwright/test";
import { del, post } from "./api";
import { ensureProject, trellis } from "./cli";
import { signIn } from "./support";

// TRL-41. The sidebar Personas link is the only route to /ai/personas. A
// link inside the scroller that holds the project tree leaves the clip box
// when the tree is taller than the sidebar: at 1440x900 the link measured top
// 864 against a scroller that clips at 835, and document.elementFromPoint at
// its centre returned the actor footer.

// A desktop at the width and the height the audit measured.
test.use({ viewport: { width: 1440, height: 900 } });

const human = "human:dana";

// The roots and the sub-projects of the audit shape: three projects, two of
// them sub-projects of the first. Every spec shares one server, which holds
// more root projects than these by the time this spec runs. More projects
// make the tree taller, which is the direction the defect needs.
const ROOTS = [
	["SID", "Sidebar reach"],
	["SIE", "Sidebar second"],
	["SIF", "Sidebar third"],
] as const;
const CHILDREN = ["Panel", "Rail"] as const;

// The sub-projects the test adds to push the tree past its scroller. Each
// one draws a project row and three page rows, so ten of them exceed the
// sidebar height at 900 px whatever else the server holds.
const FILL = 10;

const childPaths = () =>
	trellis<{ path: string }[]>(["projects", "list"], human)
		.map((project) => project.path)
		.filter((path) => path.startsWith("SID."));

test.beforeAll(async () => {
	for (const [key, name] of ROOTS) ensureProject(key, name);
	if (childPaths().length === 0) {
		for (const name of CHILDREN) await post("/projects", { parent: "SID", name });
	}
});

// The seed goes back out, so a later spec sees the project tree it expected.
test.afterAll(async () => {
	for (const [key] of ROOTS) await del(`/projects/${key}?force=true`);
});

// Where the link sits, whether the viewport holds it, and what a click at
// its centre would reach. `hit` is true when the topmost element at the
// centre is the link or something inside it, which is what a person needs
// for the click to land.
const reachOf = (page: Page, label: string) =>
	page.evaluate((name: string) => {
		const link = [...document.querySelectorAll("a[href]")].find(
			(element) => (element.textContent ?? "").trim() === name,
		)!;
		const box = link.getBoundingClientRect();
		const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return {
			top: box.top,
			bottom: box.bottom,
			inViewport: box.top >= 0 && box.bottom <= innerHeight,
			hit: top !== null && (top === link || link.contains(top) || top.contains(link)),
		};
	}, label);

// How far the project tree overflows the region that holds it, in px, and
// how far the document itself overflows. A tree taller than its scroller
// must scroll inside that one region and leave the page alone.
const overflow = (page: Page) =>
	page.evaluate(() => {
		const tree = document.querySelector('aside[aria-label="Sidebar"] [data-project-tree=""]')!;
		let region = tree.parentElement;
		while (region !== null && region.scrollHeight <= region.clientHeight) region = region.parentElement;
		const root = document.documentElement;
		return {
			tree: region === null ? 0 : region.scrollHeight - region.clientHeight,
			document: root.scrollHeight - root.clientHeight,
		};
	});

// TRL-66. The sidebar draws no wordmark, open or collapsed. A round button at
// its top collapses it to the rail of icons and opens it again.
test("sidebar > a round button collapses and expands the sidebar, and no wordmark shows", async ({ page }) => {
	await signIn(page, "/all");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(sidebar.getByRole("link", { name: "All tickets" })).toBeVisible();
	await expect(sidebar.getByRole("img", { name: "trellis" })).toHaveCount(0);

	await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
	await expect(sidebar).toHaveAttribute("data-collapsed", "true");
	await expect(sidebar.getByRole("img", { name: "trellis" })).toHaveCount(0);

	await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
	await expect(sidebar).not.toHaveAttribute("data-collapsed");
	await expect(sidebar.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

// TRL-66. While the app loads, the placeholder of the sidebar draws no
// wordmark either. Its header row has the height of the loaded header, so
// the fixed rows stay in place when the loaded sidebar replaces it.
test("sidebar > the loading sidebar shows no wordmark, and its rows stay in place when the app loads", async ({
	page,
}) => {
	let release!: () => void;
	const serverAnswers = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/rpc/**", async (route) => {
		await serverAnswers;
		await route.continue();
	});
	await signIn(page, "/all");
	const frame = page.locator("[data-shell-frame]");
	const placeholder = frame.getByRole("complementary", { name: "Sidebar" });
	const pendingRow = placeholder.getByRole("link", { name: "Needs you" });
	await expect(pendingRow).toBeVisible();
	await expect(placeholder.getByRole("img", { name: "trellis" })).toHaveCount(0);
	const pendingTop = (await pendingRow.boundingBox())!.y;

	release();
	await expect(frame).toHaveCount(0);
	const row = page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: "Needs you" });
	await expect(row).toBeVisible();
	expect((await row.boundingBox())!.y).toBe(pendingTop);
});

// TRL-66. A coarse pointer draws the collapse button at 44 px. The collapsed
// rail is 48 px wide and clips what it does not hold, so the whole circle
// must sit inside the rail.
test.describe("on a touch screen", () => {
	test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

	test("sidebar > the collapsed rail holds the whole 44 px collapse button", async ({ page }) => {
		await signIn(page, "/all");
		const sidebar = page.getByRole("complementary", { name: "Sidebar" });
		await sidebar.getByRole("button", { name: "Collapse sidebar" }).tap();
		await expect(sidebar).toHaveAttribute("data-collapsed", "true");
		await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(48);
		const rail = (await sidebar.boundingBox())!;
		const circle = (await sidebar.getByRole("button", { name: "Expand sidebar" }).boundingBox())!;
		expect(circle.width).toBe(44);
		expect(circle.x).toBeGreaterThanOrEqual(rail.x);
		expect(circle.x + circle.width).toBeLessThanOrEqual(rail.x + rail.width);
	});
});

// TRL-68. Personas and Flows are fixed destinations, listed right after Pull
// requests with no group title above them.
test("sidebar > Personas and Flows follow Pull requests in the fixed destinations", async ({ page }) => {
	await signIn(page, "/all");
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const workspace = sidebar.getByRole("navigation", { name: "Workspace" });
	await expect(workspace.getByRole("link")).toHaveText([
		"Needs you",
		/^Search/,
		"All tickets",
		"Pull requests",
		"Personas",
		"Flows",
	]);
	await expect(sidebar.getByRole("heading", { name: "AI", exact: true })).toHaveCount(0);
	await expect(sidebar.getByRole("navigation", { name: "AI", exact: true })).toHaveCount(0);

	await workspace.getByRole("link", { name: "Flows" }).click();
	await expect(page).toHaveURL(/\/ai\/flows$/);
	await expect(workspace.getByRole("link", { name: "Flows" })).toHaveAttribute("aria-current", "page");
});

test("sidebar > the Personas link stays inside the viewport while the project tree scrolls", async ({ page }) => {
	await signIn(page, "/all");
	const tree = page.getByRole("navigation", { name: "Projects" });
	for (const name of ["Sidebar reach", "Sidebar second", "Sidebar third", "Panel", "Rail"]) {
		await expect(tree.getByRole("link", { name })).toBeVisible();
	}

	const personas = page.getByRole("link", { name: "Personas" });
	await expect(personas).toBeVisible();
	expect(await personas.getAttribute("href")).toBe("/ai/personas");
	const short = await reachOf(page, "Personas");
	expect(short.bottom).toBeLessThanOrEqual(900);
	expect(short.inViewport).toBe(true);
	expect(short.hit).toBe(true);

	// A tree that no longer fits. The link keeps the place it had, because
	// only the tree region scrolls.
	for (let n = 1; n <= FILL; n += 1) await post("/projects", { parent: "SID", name: `Filler ${n}` });
	await page.reload();
	await expect(tree.getByRole("link", { name: `Filler ${FILL}` })).toBeVisible();
	const measured = await overflow(page);
	expect(measured.tree).toBeGreaterThan(0);
	expect(measured.document).toBe(0);

	const tall = await reachOf(page, "Personas");
	expect(tall.bottom).toBeLessThanOrEqual(900);
	expect(tall.inViewport).toBe(true);
	expect(tall.hit).toBe(true);
	expect(tall.top).toBe(short.top);

	await personas.click();
	await expect(page).toHaveURL(/\/ai\/personas$/);
	await expect(page.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();
});
