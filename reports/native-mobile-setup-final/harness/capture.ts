import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const productRoot = process.env.TRL1420_PRODUCT_ROOT!;
const artifactRoot = process.env.TRL1420_ARTIFACT_ROOT!;
const source = process.env.TRL1420_SOURCE!;
const baseUrl = process.env.TRL1420_BASE_URL ?? "http://127.0.0.1:4173";
const browserPath = productRoot + "/node_modules/playwright/index.mjs";
const { chromium } = await import(browserPath);
const axeSource = await readFile(productRoot + "/node_modules/axe-core/axe.min.js", "utf8");

const fixtureUrl = "http://fixture.local:4522";
const oldUrl = "http://old.fixture.local:4522";
const validName = "Dana Mobile";
const emptyNameError = "Enter your name. Use letters, numbers, spaces, or punctuation. Do not use a colon.";
const replacementWarning = "A new server clears this phone's cached tickets.";
const healthBase = {
	ok: true,
	version: "1.2.3-final",
	apiVersion: "16",
	bootId: "01M3SEP513487C9YXPHXJHF95Z",
	rss: 123456,
	addresses: [fixtureUrl],
	db: { ok: true, sizeBytes: 654321 },
	gh: { ok: true, user: "fixture", reason: null, message: null, checkedAt: "2026-10-07T00:00:00.000Z" },
};

const themes = ["light", "dark"] as const;
const caseFilter = process.env.TRL1420_CASE;
type Theme = (typeof themes)[number];
type Mode = "success" | "delay" | "timeout" | "unreachable" | "not-trellis" | "long";
type Stored = { url?: string; name?: string };
type Camera = { permission: "checking" | "prompt" | "denied" | "granted"; barcode?: string };
type RunOutput = Record<string, unknown> | void;
type Scenario = {
	id: string;
	title: string;
	width?: number;
	height?: number;
	path?: string;
	stored?: Stored;
	camera?: Camera;
	mode?: Mode;
	expected: string[];
	expectedNetworkFailure?: boolean;
	viewportScreenshot?: boolean;
	run?: (page: any) => Promise<RunOutput>;
};

const controls = [
	["textbox", "Server URL"],
	["button", "Scan pair code"],
	["button", "Test connection"],
	["textbox", "Your name"],
	["button", "Save server"],
] as const;

const fillValid = async (page: any, name = validName, url = fixtureUrl) => {
	await page.getByRole("textbox", { name: "Server URL" }).fill(url);
	await page.getByRole("textbox", { name: "Your name" }).fill(name);
};

const controlBounds = async (page: any) => {
	const result: Record<string, unknown> = {};
	for (const [role, name] of controls) result[name] = await page.getByRole(role, { name }).boundingBox();
	return result;
};

const success = async (page: any, name = validName, url = fixtureUrl) => {
	await fillValid(page, name, url);
	const before = await controlBounds(page);
	await page.getByRole("button", { name: "Test connection" }).click();
	await page.getByText("Connected to this Trellis server.", { exact: true }).waitFor();
	const after = await controlBounds(page);
	return { before, after };
};

const scenarios: Scenario[] = [
	{
		id: "fresh-setup",
		title: "Fresh setup and disabled Save server",
		expected: ["Server URL", "Scan pair code", "Test connection", "Your name", "Save server"],
		run: async (page) => ({ saveDisabled: await page.getByRole("button", { name: "Save server" }).isDisabled() }),
	},
	{
		id: "invalid-url",
		title: "Invalid URL",
		expected: ["Start the URL with http:// or https://"],
		run: async (page) => {
			await page.getByRole("textbox", { name: "Server URL" }).fill("ftp://wrong.example");
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText(/Start the URL with http:\/\//).waitFor();
		},
	},
	{
		id: "invalid-name",
		title: "Required empty name",
		mode: "success",
		expected: [emptyNameError],
		run: async (page) => {
			await page.getByRole("textbox", { name: "Server URL" }).fill(fixtureUrl);
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText("Connected to this Trellis server.", { exact: true }).waitFor();
			await page.getByText(emptyNameError, { exact: true }).waitFor();
			return { emptyNameError, saveDisabled: await page.getByRole("button", { name: "Save server" }).isDisabled() };
		},
	},
	{
		id: "connection-progress",
		title: "Connection progress",
		mode: "delay",
		expected: ["Testing connection…"],
		expectedNetworkFailure: true,
		run: async (page) => {
			await fillValid(page);
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText("Testing the connection…", { exact: true }).waitFor();
		},
	},
	{
		id: "connection-timeout",
		title: "Connection timeout",
		mode: "timeout",
		expected: ["The server did not reply in 3 seconds."],
		expectedNetworkFailure: true,
		run: async (page) => {
			await fillValid(page);
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText(/The server did not reply in 3 seconds/).waitFor({ timeout: 6000 });
		},
	},
	{
		id: "unreachable-server",
		title: "Unreachable server",
		mode: "unreachable",
		expected: ["Unable to reach this server."],
		expectedNetworkFailure: true,
		run: async (page) => {
			await fillValid(page);
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText(/Unable to reach this server/).waitFor();
		},
	},
	{
		id: "non-trellis-server",
		title: "Non-Trellis server",
		mode: "not-trellis",
		expected: ["This address does not respond as a Trellis server."],
		run: async (page) => {
			await fillValid(page);
			await page.getByRole("button", { name: "Test connection" }).click();
			await page.getByText(/does not respond as a Trellis server/).waitFor();
		},
	},
	{
		id: "successful-probe",
		title: "Successful probe and stable form controls",
		mode: "success",
		expected: ["Connected to this Trellis server.", "Server default actor"],
		run: async (page) => {
			const bounds = await success(page);
			let largestShift = 0;
			for (const [, name] of controls) {
				const before = bounds.before[name] as any;
				const after = bounds.after[name] as any;
				for (const key of ["x", "y", "width", "height"]) largestShift = Math.max(largestShift, Math.abs(before[key] - after[key]));
			}
			if (largestShift !== 0) throw new Error(`Control shift is ${largestShift}px.`);
			return { controlBoundsBefore: bounds.before, controlBoundsAfter: bounds.after, largestControlShift: largestShift };
		},
	},
	{
		id: "existing-server-replacement",
		title: "Existing server replacement warning before Save",
		stored: { url: oldUrl, name: "Existing Person" },
		mode: "success",
		expected: [replacementWarning, "Server default actor"],
		run: async (page) => {
			await success(page);
			const warning = page.getByText(replacementWarning, { exact: true });
			const save = page.getByRole("button", { name: "Save server" });
			const warningBox = await warning.boundingBox();
			const saveBox = await save.boundingBox();
			if (warningBox === null || saveBox === null) throw new Error("Replacement warning or Save server is not rendered.");
			const beforeSave = warningBox.y + warningBox.height <= saveBox.y;
			if (!beforeSave) throw new Error("Replacement warning is not before Save server.");
			return {
				warningOrder: {
					warningBox,
					saveBox,
					beforeSave,
					gapPx: saveBox.y - (warningBox.y + warningBox.height),
				},
			};
		},
	},
	{
		id: "saved-reload-retention",
		title: "Saved values retained after a browser reload",
		mode: "success",
		expected: ["Server URL", "Your name"],
		run: async (page) => {
			await success(page);
			await page.getByRole("button", { name: "Save server" }).click();
			await page.waitForFunction(
				([url, name]: string[]) =>
					localStorage.getItem("trellis:trellis-server-url") === url &&
					localStorage.getItem("trellis:trellis-actor-name") === name,
				[fixtureUrl, validName],
			);
			await page.goto(baseUrl + "/setup", { waitUntil: "domcontentloaded" });
			await page.getByRole("textbox", { name: "Server URL" }).waitFor();
			await page.reload({ waitUntil: "domcontentloaded" });
			const url = await page.getByRole("textbox", { name: "Server URL" }).inputValue();
			const name = await page.getByRole("textbox", { name: "Your name" }).inputValue();
			if (url !== fixtureUrl || name !== validName) throw new Error("Saved setup values did not survive reload.");
			return { retained: { url, name } };
		},
	},
	{
		id: "invalid-pair-link",
		title: "Invalid pair-link URL",
		path: "/pair?url=ftp%3A%2F%2Finvalid.example",
		expected: ["Start the URL with http:// or https://"],
		run: async (page) => page.getByText(/Start the URL with http:\/\//).waitFor(),
	},
	{
		id: "valid-pair-link",
		title: "Valid pair-link URL",
		path: "/pair?url=http%3A%2F%2Ffixture.local%3A4522",
		mode: "success",
		expected: ["Connected to this Trellis server."],
		run: async (page) => page.getByText("Connected to this Trellis server.", { exact: true }).waitFor(),
	},
	{
		id: "camera-permission-request",
		title: "Camera permission request",
		camera: { permission: "prompt" },
		expected: ["Allow camera access", "Allow camera", "Cancel scan"],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByRole("button", { name: "Allow camera" }).waitFor();
		},
	},
	{
		id: "camera-denied",
		title: "Camera access denied",
		camera: { permission: "denied" },
		expected: ["Camera access is off.", "Open Settings", "Cancel scan"],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByText(/Camera access is off/).waitFor();
		},
	},
	{
		id: "camera-granted",
		title: "Camera access granted",
		camera: { permission: "granted" },
		expected: ["Point the camera at the Trellis pair code.", "Cancel scan"],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByText("Point the camera at the Trellis pair code.", { exact: true }).waitFor();
		},
	},
	{
		id: "invalid-qr",
		title: "Invalid QR scan",
		camera: { permission: "granted", barcode: "not-a-trellis-pair-link" },
		expected: ["This code does not contain a Trellis pair link."],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByText(/does not contain a Trellis pair link/).waitFor();
		},
	},
	{
		id: "valid-qr",
		title: "Valid QR scan",
		camera: { permission: "granted", barcode: "trellis://pair?url=http%3A%2F%2Ffixture.local%3A4522" },
		mode: "success",
		expected: ["Connected to this Trellis server."],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByText("Connected to this Trellis server.", { exact: true }).waitFor();
		},
	},
	{
		id: "scan-cancel",
		title: "Scan cancel",
		camera: { permission: "granted" },
		expected: ["Scan pair code"],
		run: async (page) => {
			await page.getByRole("button", { name: "Scan pair code" }).click();
			await page.getByRole("button", { name: "Cancel scan" }).click();
			await page.getByRole("button", { name: "Scan pair code" }).waitFor();
		},
	},
	{
		id: "focus-transitions",
		title: "Tab order from Server URL and visible focus",
		mode: "success",
		expected: ["Server URL", "Scan pair code", "Test connection", "Your name", "Save server"],
		run: async (page) => {
			await success(page);
			await page.getByRole("textbox", { name: "Server URL" }).focus();
			const order = [];
			const focusEvidence = [];
			for (let index = 0; index < 5; index += 1) {
				const active = await page.evaluate(() => {
					const element = document.activeElement as HTMLElement | null;
					if (element === null) return null;
					const style = getComputedStyle(element);
					return {
						name: element.getAttribute("aria-label") ?? element.innerText ?? element.getAttribute("placeholder"),
						focusVisible: element.matches(":focus-visible"),
						outlineStyle: style.outlineStyle,
						outlineWidth: style.outlineWidth,
						outlineColor: style.outlineColor,
						boxShadow: style.boxShadow,
					};
				});
				if (active === null) throw new Error("The tab-order check has no active control.");
				order.push(active.name);
				focusEvidence.push(active);
				if (!active.focusVisible || (active.outlineWidth === "0px" && active.boxShadow === "none")) {
					throw new Error(`The ${active.name} control has no visible keyboard focus evidence: ${JSON.stringify(active)}`);
				}
				if (index < 4) await page.keyboard.press("Tab");
			}
			const expected = ["Server URL", "Scan pair code", "Test connection", "Your name", "Save server"];
			if (JSON.stringify(order) !== JSON.stringify(expected)) throw new Error(`Tab order from Server URL: ${JSON.stringify(order)}`);
			return { tabOrderFrom: "Server URL", focusOrder: order, focusEvidence };
		},
	},
	{
		id: "long-content-reflow",
		title: "Long server details at the 200 percent reflow proxy",
		width: 160,
		height: 720,
		mode: "long",
		viewportScreenshot: true,
		expected: ["final-version-with-a-deliberately-long-build-identity-2026.10.07", "987654 tickets", "Server default actor"],
		run: async (page) => {
			await success(page, validName);
			const version = page.getByText("Version", { exact: true });
			await version.evaluate((element: HTMLElement) => element.scrollIntoView({ block: "start" }));
			await page.waitForTimeout(80);
			const names = ["Version", "final-version-with-a-deliberately-long-build-identity-2026.10.07", "Tickets", "987654 tickets", "Server default actor", "Synthetic Person With A Deliberately Long Browser Baseline Identity"];
			const detailBoxes: Record<string, unknown> = {};
			for (const name of names) detailBoxes[name] = await page.getByText(name, { exact: true }).boundingBox();
			const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY }));
			for (const [name, box] of Object.entries(detailBoxes)) {
				const value = box as any;
				if (value === null || value.y < 0 || value.y + value.height > viewport.height) throw new Error(`${name} is outside the captured viewport.`);
			}
			return { detailBoxes, detailViewport: viewport, allDetailsVisible: true };
		},
	},
	{
		id: "desktop-success",
		title: "Desktop-width comparison",
		width: 1024,
		height: 768,
		mode: "success",
		expected: ["Connected to this Trellis server.", "Server default actor"],
		run: async (page) => success(page),
	},
];

const apiValue = (pathname: string, mode: Mode) => {
	if (pathname.endsWith("/health")) {
		if (mode === "not-trellis") return { not: "health" };
		return {
			...healthBase,
			version: mode === "long" ? "final-version-with-a-deliberately-long-build-identity-2026.10.07" : healthBase.version,
		};
	}
	if (pathname.endsWith("/tickets/counts")) return { total: mode === "long" ? 987654 : 42, byStatus: [] };
	if (pathname.endsWith("/actors/default")) {
		return {
			name: mode === "long" ? "Synthetic Person With A Deliberately Long Browser Baseline Identity" : "Fixture Person",
			kind: "human",
			stored: true,
		};
	}
	return null;
};

const collectControls = (page: any) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll("input,button,[role=button]")).map((element) => ({
			tag: element.tagName,
			role: element.getAttribute("role"),
			name: element.getAttribute("aria-label") ?? (element as HTMLElement).innerText ?? element.getAttribute("placeholder"),
			disabled: (element as HTMLButtonElement).disabled ?? false,
		})),
	);

const browser = await chromium.launch({ headless: true });

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
	const failedRequests: string[] = [];
	page.on("console", (message: any) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("pageerror", (error: Error) => pageErrors.push(error.message));
	page.on("requestfailed", (request: any) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
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
		if (mode === "delay" || mode === "timeout") await new Promise((resolve) => setTimeout(resolve, mode === "delay" ? 4500 : 3500));
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
	for (const text of scenario.expected) {
		if (!(await page.getByText(text, { exact: false }).first().isVisible())) throw new Error(`${scenario.id} is missing: ${text}`);
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
	const axe = await page.evaluate(async () => (globalThis as any).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
	const axeViolations = axe.violations
		.filter((violation: any) => violation.impact === "serious" || violation.impact === "critical")
		.map((violation: any) => ({ id: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.map((node: any) => node.target) }));
	const metrics = await page.evaluate(() => ({
		reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
		colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
		innerWidth,
		innerHeight,
		scrollWidth: document.documentElement.scrollWidth,
		horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
		cumulativeLayoutShift: ((globalThis as any).__TRELLIS_LAYOUT_SHIFTS__ as number[]).reduce((sum, value) => sum + value, 0),
	}));
	if (axeViolations.length > 0) throw new Error(`${scenario.id} has serious or critical axe findings.`);
	if (metrics.horizontalOverflow !== 0) throw new Error(`${scenario.id} has ${metrics.horizontalOverflow}px horizontal overflow.`);
	const unexpectedConsoleErrors = scenario.expectedNetworkFailure
		? consoleErrors.filter((message) => !message.includes("Failed to load resource"))
		: consoleErrors;
	const unexpectedFailedRequests = scenario.expectedNetworkFailure ? [] : failedRequests;
	if (unexpectedConsoleErrors.length > 0 || pageErrors.length > 0 || unexpectedFailedRequests.length > 0) {
		throw new Error(`${scenario.id} browser errors: ${JSON.stringify({ consoleErrors: unexpectedConsoleErrors, pageErrors, unexpectedFailedRequests })}`);
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
		expectedNetworkFailure: scenario.expectedNetworkFailure ?? false,
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
await writeFile(path.join(artifactRoot, "results.json"), JSON.stringify(evidence, null, 2) + "\n");

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
const warningGaps = results.filter((result) => result.id === "existing-server-replacement").map((result) => result.warningOrder.gapPx);
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native mobile setup final</title><style>
:root{color-scheme:dark;--bg:#0d0f12;--surface:#151920;--surface2:#1d232c;--border:#303846;--fg:#f3f5f7;--muted:#aab3bf;--accent:#64d98b;--danger:#ffb16b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Inter,system-ui,sans-serif}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:48px 0 80px}.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:end;padding:32px;border:1px solid var(--border);border-radius:20px;background:linear-gradient(145deg,var(--surface),#101d17)}.eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}h1{font-size:clamp(36px,6vw,72px);line-height:1;letter-spacing:-.04em;margin:12px 0 18px}h2{font-size:28px;margin:48px 0 16px}h3{font-size:18px;margin:6px 0}p{color:var(--muted);margin:0}.warning{border-left:3px solid var(--danger);padding-left:16px;color:var(--fg)}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{padding:16px;border:1px solid var(--border);border-radius:14px;background:#0003}.metric strong{display:block;font-size:28px}.proof{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.proof div{padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.proof strong{display:block;color:var(--accent);font-size:22px}table{width:100%;table-layout:fixed;border-collapse:collapse;background:var(--surface);border:1px solid var(--border)}th,td{text-align:left;padding:12px 14px;overflow-wrap:anywhere;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:12px;text-transform:uppercase}.status,td span{color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}.card{overflow:hidden;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.card img{display:block;width:100%;height:440px;object-fit:contain;background:var(--surface2)}.body{padding:16px}.gaps{columns:2;padding:24px 40px;border:1px solid var(--border);background:var(--surface)}a{color:var(--accent)}code{color:var(--fg);overflow-wrap:anywhere}@media(max-width:700px){main{width:min(100% - 20px,1180px);padding-top:20px}.hero{grid-template-columns:1fr;padding:22px}.gaps{columns:1}.card img{height:360px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><main>
<section class="hero"><div><div class="eyebrow">Final browser evidence / ${source.slice(0,12)}</div><h1>Setup and pairing</h1><p class="warning">These captures use Expo Web and deterministic route fixtures. They do not prove Android or iOS behavior.</p></div><div class="metrics"><div class="metric"><strong>${counts.cases}</strong>browser cases</div><div class="metric"><strong>${counts.screenshots}</strong>screenshots</div><div class="metric"><strong>${counts.casesWithAxeViolations}</strong>cases with serious or critical axe findings</div><div class="metric"><strong>${counts.casesWithHorizontalOverflow}</strong>overflow cases</div><div class="metric"><strong>${counts.casesWithUnexpectedConsoleErrors + counts.casesWithUnexpectedFailedRequests + counts.casesWithPageErrors}</strong>unexpected browser errors</div></div></section>
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
