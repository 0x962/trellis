import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "./fixture/node_modules/playwright/index.mjs";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");
await mkdir(`${root}/assets`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
for (const [name, url] of [
	["app", "https://app.superset.sh/"],
	["mobile", "https://superset.sh/mobile"],
	["remote-access", "https://docs.superset.sh/remote-access"],
]) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
	const page = await ctx.newPage();
	const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
	await page.screenshot({ path: `${root}/assets/${name}-desktop.png`, fullPage: true });
	const record = {
		name,
		url,
		finalUrl: page.url(),
		status: response?.status(),
		date: new Date().toISOString(),
		title: await page.title(),
		text: await page.locator("body").innerText(),
		images: await page.locator("img").evaluateAll((imgs) => imgs.map((i) => ({ src: i.src, alt: i.alt }))),
		videos: await page.locator("video,iframe").evaluateAll((els) => els.map((e) => ({ src: e.src, poster: e.poster }))),
	};
	results.push(record);
	console.log(JSON.stringify(record));
	if (name === "app") {
		await page.setViewportSize({ width: 320, height: 720 });
		await page.screenshot({ path: `${root}/assets/app-320.png`, fullPage: true });
	}
	await ctx.close();
}
await writeFile(`${root}/public-results.json`, `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
