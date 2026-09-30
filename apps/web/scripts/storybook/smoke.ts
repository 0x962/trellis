import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { installStoryObserver, type StoryWindow } from "./installStoryObserver";
import { managerCheck } from "./managerCheck";

type StoryEntry = { id: string; title: string; name: string; type: string; tags: string[] };
type StoryResult = {
	id: string;
	title: string;
	name: string;
	viewport: { width: number; height: number } | null;
	errors: string[];
};

const origin = process.env.STORYBOOK_URL ?? "http://127.0.0.1:6006";
const response = await fetch(`${origin}/index.json`);
if (!response.ok) throw new Error(`Story index returns ${response.status}.`);
const index = (await response.json()) as { entries: Record<string, StoryEntry> };
const filter = process.env.STORYBOOK_FILTER;
const stories = Object.values(index.entries).filter(
	(entry) => entry.type === "story" && (filter === undefined || entry.id.includes(filter)),
);
if (stories.length === 0) throw new Error("The selected story list is empty.");

const browser = await chromium.launch({ channel: process.env.STORYBOOK_BROWSER, headless: true });
const results: StoryResult[] = [];
const output = process.env.STORYBOOK_RESULTS;
const viewport = { width: 1440, height: 900 };
let manager: { checks: string[]; errors: string[] } = { checks: [], errors: [] };

const inspectStory = async (page: Page, story: StoryEntry): Promise<StoryResult> => {
	const errors: string[] = [];
	const onError = (error: Error) => errors.push(error.message);
	page.on("pageerror", onError);
	try {
		await page.goto(`${origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
			waitUntil: "domcontentloaded",
		});
		await page.waitForFunction(
			() => {
				const state = (window as unknown as StoryWindow).__trellisStoryCheck;
				return state.finished || state.errors.length > 0 || document.body.classList.contains("sb-show-errordisplay");
			},
			undefined,
			{ timeout: 30_000 },
		);
		await page.evaluate(
			() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
		);
		const state = await page.evaluate(() => {
			const state = (window as unknown as StoryWindow).__trellisStoryCheck;
			return {
				errors: state.errors,
				error: document.body.classList.contains("sb-show-errordisplay") ? document.body.innerText : null,
			};
		});
		errors.push(...state.errors);
		if (state.error) errors.push(state.error);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	} finally {
		page.off("pageerror", onError);
	}
	return {
		id: story.id,
		title: story.title,
		name: story.name,
		viewport: page.viewportSize(),
		errors: [...new Set(errors)],
	};
};

try {
	const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
	await context.exposeBinding("__trellisStoryViewport", ({ page }, size: { width: number; height: number }) =>
		page.setViewportSize(size),
	);
	await context.addInitScript(installStoryObserver);
	const page = await context.newPage();
	for (const story of stories) {
		await context.clearCookies();
		const result = await inspectStory(page, story);
		results.push(result);
		if (result.errors.length > 0)
			console.error(`${story.id}: ${result.errors.map((error) => error.split("\n")[0]).join("; ")}`);
		if (results.length % 25 === 0) console.log(`${results.length}/${stories.length} stories checked.`);
	}
	if (!filter) manager = await managerCheck(browser, origin);
} finally {
	await browser.close();
}

const failed = results.filter((result) => result.errors.length > 0);
const report = {
	total: results.length,
	passed: results.length - failed.length,
	failed: failed.length,
	manager,
	results,
};
if (output) {
	await mkdir(resolve(output, ".."), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`${report.passed}/${report.total} stories pass. ${report.failed} stories fail.`);
for (const check of manager.checks) console.log(check);
for (const error of manager.errors) console.error(error);
process.exitCode = failed.length > 0 || manager.errors.length > 0 ? 1 : 0;
