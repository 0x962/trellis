export const baseUrl = process.env.TRL1420_BASE_URL!;
export const fixtureUrl = "http://fixture.local:4522";
export const oldUrl = "http://old.fixture.local:4522";
export const validName = "Dana Mobile";
export const emptyNameError = "Enter your name. Use letters, numbers, spaces, or punctuation. Do not use a colon.";
export const replacementWarning = "A new server clears this phone's cached tickets.";
export const healthBase = {
	ok: true,
	version: "1.2.3-final",
	apiVersion: "16",
	bootId: "01M3SEP513487C9YXPHXJHF95Z",
	rss: 123456,
	addresses: [fixtureUrl],
	db: { ok: true, sizeBytes: 654321 },
	gh: { ok: true, user: "fixture", reason: null, message: null, checkedAt: "2026-10-07T00:00:00.000Z" },
};

export type Mode = "success" | "delay" | "timeout" | "unreachable" | "not-trellis" | "long";
export type Stored = { url?: string; name?: string };
export type Camera = { permission: "checking" | "prompt" | "denied" | "granted"; barcode?: string };
export type RunOutput = Record<string, unknown> | undefined;
export type Scenario = {
	id: string;
	title: string;
	width?: number;
	height?: number;
	path?: string;
	stored?: Stored;
	camera?: Camera;
	mode?: Mode;
	expected: string[];
	expectedNetworkError?: {
		errorText: string;
		consoleMessage?: string;
	};
	viewportScreenshot?: boolean;
	run?: (page: any) => Promise<RunOutput>;
};

export const controls = [
	["textbox", "Server URL"],
	["button", "Scan pair code"],
	["button", "Test connection"],
	["textbox", "Your name"],
	["button", "Save server"],
] as const;

export const collectControls = (page: any) =>
	page.evaluate(() =>
		Array.from(document.querySelectorAll("input,button,[role=button]")).map((element) => ({
			tag: element.tagName,
			role: element.getAttribute("role"),
			name:
				element.getAttribute("aria-label") ?? (element as HTMLElement).innerText ?? element.getAttribute("placeholder"),
			disabled: (element as HTMLButtonElement).disabled ?? false,
		})),
	);

export const fillValid = async (page: any, name = validName, url = fixtureUrl) => {
	await page.getByRole("textbox", { name: "Server URL" }).fill(url);
	await page.getByRole("textbox", { name: "Your name" }).fill(name);
};

export const controlBounds = async (page: any) => {
	const result: Record<string, unknown> = {};
	for (const [role, name] of controls) result[name] = await page.getByRole(role, { name }).boundingBox();
	return result;
};

export const success = async (page: any, name = validName, url = fixtureUrl) => {
	await fillValid(page, name, url);
	const before = await controlBounds(page);
	await page.getByRole("button", { name: "Test connection" }).click();
	await page.getByText("Connected to this Trellis server.", { exact: true }).waitFor();
	const after = await controlBounds(page);
	return { before, after };
};
export const apiValue = (pathname: string, mode: Mode) => {
	if (pathname.endsWith("/health")) {
		if (mode === "not-trellis") return { not: "health" };
		return {
			...healthBase,
			version:
				mode === "long" ? "final-version-with-a-deliberately-long-build-identity-2026.10.07" : healthBase.version,
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
export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
