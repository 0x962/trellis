import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const productRoot = process.env.TRL1420_PRODUCT_ROOT!;
const artifactRoot = process.env.TRL1420_ARTIFACT_ROOT!;
const source = process.env.TRL1420_SOURCE!;
const caseFilter = process.env.TRL1420_CASE;
const negativeControl = process.env.TRL1420_NEGATIVE_CONTROL;
const browserPath = `${productRoot}/node_modules/playwright/index.mjs`;
const { chromium } = await import(browserPath);
const axeSource = await readFile(`${productRoot}/node_modules/axe-core/axe.min.js`, "utf8");

import {
	apiValue,
	baseUrl,
	type Camera,
	collectControls,
	fixtureUrl,
	type Scenario,
	type Stored,
	type Theme,
	themes,
} from "./lib/fixture";
import { pairingScenarios } from "./lib/pairingScenarios";
import { setupScenarios } from "./lib/setupScenarios";

const scenarios: Scenario[] = [...setupScenarios, ...pairingScenarios];
const browser = await chromium.launch({ headless: true });

type FailedRequest = {
	url: string;
	errorText: string;
};

const renderCase = async (theme: Theme, scenario: Scenario) => {
	const width = scenario.width ?? 320;
	const height = scenario.height ?? 720;
	const mode = scenario.mode ?? "success";
	const browserContext = await browser.newContext({
		viewport: { width, height },
		colorScheme: theme,
		reducedMotion: "reduce",
		hasTouch: width <= 320,
		isMobile: width <= 320,
	});
	const stored = scenario.stored ?? {};
	const camera = scenario.camera ?? { permission: "prompt" };
	await browserContext.addInitScript(
		({ theme, stored, camera }: { theme: Theme; stored: Stored; camera: Camera }) => {
			if (sessionStorage.getItem("trellis:fixture-initialized") !== "true") {
				localStorage.clear();
				localStorage.setItem("trellis:trellis-theme", theme);
				if (stored.url) localStorage.setItem("trellis:trellis-server-url", stored.url);
				if (stored.name) localStorage.setItem("trellis:trellis-actor-name", stored.name);
				sessionStorage.setItem("trellis:fixture-initialized", "true");
			}
			(globalThis as any).__TRELLIS_CAMERA_FIXTURE__ = camera;
			(globalThis as any).__TRELLIS_LAYOUT_SHIFTS__ = [];
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) (globalThis as any).__TRELLIS_LAYOUT_SHIFTS__.push((entry as any).value);
			}).observe({ type: "layout-shift", buffered: true });
		},
		{ theme, stored, camera },
	);
	const page = await browserContext.newPage();
	const consoleErrors: string[] = [];
	const pageErrors: string[] = [];
	const failedRequests: FailedRequest[] = [];
	page.on("console", (message: any) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("pageerror", (error: Error) => pageErrors.push(error.message));
	page.on("requestfailed", (request: any) =>
		failedRequests.push({
			url: request.url(),
			errorText: request.failure()?.errorText ?? "failed",
		}),
	);
	await page.route(/^http:\/\/(?:old\.)?fixture\.local:4522\//, async (route: any) => {
		const request = route.request();
		if (request.method() === "OPTIONS") {
			await route.fulfill({
				status: 204,
				headers: {
					"access-control-allow-origin": baseUrl,
					"access-control-allow-headers": "content-type,x-trellis-actor,x-trellis-client",
					"access-control-allow-methods": "GET,POST,OPTIONS",
				},
			});
			return;
		}
		if (new URL(request.url()).pathname === "/api/events") {
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				headers: { "access-control-allow-origin": baseUrl },
				body: ": synthetic fixture\n\n",
			});
			return;
		}
		if (mode === "unreachable") {
			await route.abort("connectionrefused");
			return;
		}
		if (mode === "delay" || mode === "timeout")
			await new Promise((resolve) => setTimeout(resolve, mode === "delay" ? 4500 : 3500));
		const value = apiValue(new URL(request.url()).pathname, mode);
		await route.fulfill({
			status: value === null ? 404 : 200,
			contentType: "application/json",
			headers: { "access-control-allow-origin": baseUrl },
			body: JSON.stringify({ json: value }),
		});
	});
	const target = baseUrl + (scenario.path ?? "/setup");
	const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 20_000 });
	await page.getByRole("textbox", { name: "Server URL" }).waitFor({ timeout: 20_000 });
	const output = (await scenario.run?.(page)) ?? {};
	if (negativeControl === "unrelated-network-error") {
		consoleErrors.push("Failed to load resource: net::ERR_CONNECTION_REFUSED");
		failedRequests.push({ url: "http://unrelated.fixture.invalid/probe", errorText: "net::ERR_CONNECTION_REFUSED" });
	}
	for (const text of scenario.expected) {
		if (!(await page.getByText(text, { exact: false }).first().isVisible()))
			throw new Error(`${scenario.id} is missing: ${text}`);
	}
	const setupInput = page.getByRole("textbox", { name: "Server URL" });
	await setupInput.waitFor({ state: "visible" });
	const recovery = await setupInput.evaluate((element: Element) => ({
		attached: element.isConnected,
		bodyAttached: document.body.isConnected,
		readyState: document.readyState,
		visibleText: document.body.innerText,
	}));
	if (!recovery.attached || !recovery.bodyAttached || recovery.readyState !== "complete") {
		throw new Error(`${scenario.id} did not recover an attached setup page: ${JSON.stringify(recovery)}`);
	}
	await page.addScriptTag({ content: axeSource });
	const axe = await page.evaluate(async () =>
		(globalThis as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }),
	);
	const axeViolations = axe.violations
		.filter((violation: any) => violation.impact === "serious" || violation.impact === "critical")
		.map((violation: any) => ({
			id: violation.id,
			impact: violation.impact,
			help: violation.help,
			targets: violation.nodes.map((node: any) => node.target),
		}));
	const metrics = await page.evaluate(() => ({
		reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
		colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
		innerWidth,
		innerHeight,
		scrollWidth: document.documentElement.scrollWidth,
		horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
		cumulativeLayoutShift: ((globalThis as any).__TRELLIS_LAYOUT_SHIFTS__ as number[]).reduce(
			(sum, value) => sum + value,
			0,
		),
	}));
	if (axeViolations.length > 0) throw new Error(`${scenario.id} has serious or critical axe findings.`);
	if (metrics.horizontalOverflow !== 0)
		throw new Error(`${scenario.id} has ${metrics.horizontalOverflow}px horizontal overflow.`);
	const unexpectedConsoleErrors = consoleErrors.filter(
		(message) => message !== scenario.expectedNetworkError?.consoleMessage,
	);
	const expectedFailureUrl = `${fixtureUrl}/rpc/system/health`;
	const unexpectedFailedRequests = failedRequests.filter(
		(request) => request.url !== expectedFailureUrl || request.errorText !== scenario.expectedNetworkError?.errorText,
	);
	if (unexpectedConsoleErrors.length > 0 || pageErrors.length > 0 || unexpectedFailedRequests.length > 0) {
		throw new Error(
			`${scenario.id} browser errors: ${JSON.stringify({ consoleErrors: unexpectedConsoleErrors, pageErrors, unexpectedFailedRequests })}`,
		);
	}
	const assetDirectory = path.join(artifactRoot, "assets", theme);
	await mkdir(assetDirectory, { recursive: true });
	const screenshot = `assets/${theme}/${scenario.id}-${width}px.png`;
	await page.screenshot({ path: path.join(artifactRoot, screenshot), fullPage: !scenario.viewportScreenshot });
	const record = {
		kind: "final browser evidence",
		id: scenario.id,
		title: scenario.title,
		theme,
		width,
		height,
		route: scenario.path ?? "/setup",
		screenshot,
		expectedText: scenario.expected,
		...output,
		visibleText: recovery.visibleText,
		controls: await collectControls(page),
		axeViolations,
		consoleErrors,
		pageErrors,
		failedRequests,
		expectedNetworkError: scenario.expectedNetworkError ?? null,
		unexpectedConsoleErrors,
		unexpectedFailedRequests,
		metrics,
		httpStatus: response?.status() ?? null,
	};
	await browserContext.close();

	return record;
};

await rm(path.join(artifactRoot, "assets"), { recursive: true, force: true });
const results: any[] = [];
for (const theme of themes) {
	for (const scenario of scenarios) {
		if (caseFilter !== undefined && scenario.id !== caseFilter) continue;
		console.log(`${theme} ${scenario.id}`);
		results.push(await renderCase(theme, scenario));
	}
}
await browser.close();

const counts = {
	cases: results.length,
	screenshots: results.length,
	themes: themes.length,
	width320: results.filter((result) => result.width === 320).length,
	width160: results.filter((result) => result.width === 160).length,
	width1024: results.filter((result) => result.width === 1024).length,
	casesWithAxeViolations: results.filter((result) => result.axeViolations.length > 0).length,
	casesWithHorizontalOverflow: results.filter((result) => result.metrics.horizontalOverflow > 0).length,
	casesWithUnexpectedConsoleErrors: results.filter((result) => result.unexpectedConsoleErrors.length > 0).length,
	casesWithUnexpectedFailedRequests: results.filter((result) => result.unexpectedFailedRequests.length > 0).length,
	casesWithPageErrors: results.filter((result) => result.pageErrors.length > 0).length,
};
const evidence = {
	kind: "final native setup browser evidence",
	source,
	capturedAt: new Date().toISOString(),
	scope: "Setup and pairing browser route behavior",
	method: {
		renderer: "Expo Web with React Native Web",
		storage: "Temporary localStorage-backed SQLiteStorage fixture",
		camera: "Temporary deterministic camera fixture for permission and QR route states",
		browser: "Playwright Chromium",
		viewports: ["320 by 720", "160 by 720 reflow proxy", "1024 by 768 comparison"],
		colorSchemes: themes,
		reducedMotion: true,
		syntheticDataOnly: true,
	},
	counts,
	nativeGaps: [
		"Android and iOS rendering",
		"TalkBack and VoiceOver output",
		"Camera permission sheets and hardware QR capture",
		"Soft keyboard and native text entry",
		"Dynamic Type at 200 percent",
		"Safe-area insets",
		"Native deep links",
		"Native touch and gesture behavior",
		"SQLite retention after an app restart",
		"Native reduced-motion settings",
		"Initial browser page focus before a user action",
	],
	results,
};
await writeFile(path.join(artifactRoot, "results.json"), `${JSON.stringify(evidence, null, 2)}\n`);

const cards = results
	.map((result) => {
		const note =
			result.id === "existing-server-replacement"
				? `Warning precedes Save by ${result.warningOrder.gapPx}px.`
				: result.id === "invalid-name"
					? emptyNameError
					: result.id === "long-content-reflow"
						? "The capture scrolls to the complete server details. All detail rows are inside the 160 px viewport."
						: result.id === "successful-probe"
							? `Largest control shift: ${result.largestControlShift}px.`
							: result.axeViolations.length === 0
								? "No serious or critical axe finding."
								: "See results.json.";
		return `<article class="card"><a href="${result.screenshot}"><img src="${result.screenshot}" alt="${result.title} in the ${result.theme} theme at ${result.width} CSS pixels"></a><div class="body"><div class="eyebrow">${result.theme} / ${result.width} px</div><h3>${result.title}</h3><p>${note}</p></div></article>`;
	})
	.join("");
const warningGaps = results
	.filter((result) => result.id === "existing-server-replacement")
	.map((result) => result.warningOrder.gapPx);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native mobile setup final</title><style>
:root{color-scheme:dark;--bg:#0d0f12;--surface:#151920;--surface2:#1d232c;--border:#303846;--fg:#f3f5f7;--muted:#aab3bf;--accent:#64d98b;--danger:#ffb16b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:48px 0 80px}.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:end;padding:32px;border:1px solid var(--border);border-radius:20px;background:linear-gradient(145deg,var(--surface),#101d17)}.eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(36px,6vw,72px);line-height:1;letter-spacing:-.04em;margin:12px 0 18px}h2{font-size:28px;margin:48px 0 16px}h3{font-size:18px;margin:6px 0}p{color:var(--muted);margin:0}.warning{border-left:3px solid var(--danger);padding-left:16px;color:var(--fg)}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{padding:16px;border:1px solid var(--border);border-radius:14px;background:#0003}.metric strong{display:block;font-size:28px}.proof{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.proof div{padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.proof strong{display:block;color:var(--accent);font-size:22px}table{width:100%;table-layout:fixed;border-collapse:collapse;background:var(--surface);border:1px solid var(--border)}th,td{text-align:left;padding:12px 14px;overflow-wrap:anywhere;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:12px;text-transform:uppercase}.status,td span{color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.card{overflow:hidden;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.card img{display:block;width:100%;height:440px;object-fit:contain;background:var(--surface2)}.body{padding:16px}.gaps{columns:2;padding:24px 40px;border:1px solid var(--border);background:var(--surface)}a{color:var(--accent)}code{color:var(--fg);overflow-wrap:anywhere}@media(max-width:700px){main{width:min(100% - 20px,1180px);padding-top:20px}.hero{grid-template-columns:1fr;padding:22px}.gaps{columns:1}.card img{height:360px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><main>
<section class="hero"><div><div class="eyebrow">Final browser evidence / ${source.slice(0, 12)}</div><h1>Setup and pairing</h1><p class="warning">These captures use Expo Web and deterministic route fixtures. They do not prove Android or iOS behavior.</p></div><div class="metrics"><div class="metric"><strong>${counts.cases}</strong>browser cases</div><div class="metric"><strong>${counts.screenshots}</strong>screenshots</div><div class="metric"><strong>${counts.casesWithAxeViolations}</strong>cases with serious or critical axe findings</div><div class="metric"><strong>${counts.casesWithHorizontalOverflow}</strong>overflow cases</div><div class="metric"><strong>${counts.casesWithUnexpectedConsoleErrors + counts.casesWithUnexpectedFailedRequests + counts.casesWithPageErrors}</strong>unexpected browser errors</div></div></section>
<h2>Measured repairs</h2><section class="proof"><div><strong>${Math.min(...warningGaps)} px</strong>minimum space from the replacement warning to Save</div><div><strong>Before Save</strong>replacement warning in both themes</div><div><strong>Required</strong>empty-name message before character guidance</div><div><strong>Visible</strong>all long server details in the 160 px capture</div><div><strong>0 px</strong>largest control shift after a successful probe</div></section>
<h2>Coverage</h2><table><thead><tr><th>Journey</th><th>Browser state</th><th>Boundary</th></tr></thead><tbody><tr><td>Fresh setup, validation, progress, errors, success, save, and reload</td><td><span>Captured</span></td><td>Both themes</td></tr><tr><td>Existing server replacement</td><td><span>Captured</span></td><td>Warning order measured</td></tr><tr><td>Pair links, camera states, QR routes, and cancel</td><td><span>Captured</span></td><td>Deterministic camera fixture</td></tr><tr><td>Long detail values and reflow</td><td><span>Captured</span></td><td>Scrolled 160 px viewport</td></tr><tr><td>Tab order from Server URL, visible focus, reduced motion, and stable layout</td><td><span>Captured</span></td><td>DOM evidence only</td></tr></tbody></table>
<h2>Method boundary</h2><p>The matrix uses temporary browser storage and camera fixtures. It tests browser route behavior only. It does not test native permission sheets, camera hardware, or hardware QR recognition.</p>
<h2>Native proof gaps</h2><ul class="gaps">${evidence.nativeGaps.map((gap) => `<li>${gap}</li>`).join("")}</ul>
<h2>Rendered states</h2><div class="grid">${cards}</div>
<h2>Machine-readable evidence</h2><p>Open <a href="results.json">results.json</a> for order measurements, control bounds, focus transitions, reload values, axe results, errors, layout measurements, and screenshot paths.</p>
<h2>Repeat method</h2><p>Run <code>harness/run.sh &lt;product-worktree&gt; &lt;artifact-directory&gt; &lt;expected-source&gt;</code> on Boxd.</p>
</main></body></html>`;
await writeFile(path.join(artifactRoot, "index.html"), html);
console.log(JSON.stringify({ source, counts, warningGaps }, null, 2));
