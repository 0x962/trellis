import { expect, type Page, test } from "@playwright/test";
import type { DesktopServiceStatus, DesktopStatus, DesktopUpdateStatus } from "../src/lib/desktopBridge";
import { signIn } from "./support";

const packaged: DesktopStatus = {
	packaged: true,
	dataDirectory: "/Users/dana/.trellis",
	openAtLogin: false,
};

const packagedService: DesktopServiceStatus = "requiresApproval";
const packagedUpdate: DesktopUpdateStatus = {
	state: "restart-required",
	detail: "The previous host still runs.",
	version: "1.2.3",
	release: "abcdef123456",
	protocol: 3,
};

// Each bridge call writes to window.desktopCalls. The status values remain
// writable so each test can reproduce a change from macOS after page load.
const installBridge = (
	page: Page,
	value: {
		status: DesktopStatus;
		service?: DesktopServiceStatus;
		update?: DesktopUpdateStatus;
		serviceError?: string;
	},
) =>
	page.addInitScript((initial) => {
		const calls: unknown[][] = [];
		Object.defineProperty(window, "desktopCalls", { value: calls });
		Object.defineProperty(window, "desktopStatus", { value: initial.status, writable: true });
		Object.defineProperty(window, "desktopService", { value: initial.service ?? null, writable: true });
		Object.defineProperty(window, "desktopUpdate", { value: initial.update ?? null, writable: true });
		Object.defineProperty(window, "desktopServiceError", { value: initial.serviceError, writable: true });
		Object.defineProperty(window, "desktopNavigate", { value: undefined, writable: true });
		Object.defineProperty(window, "trellisDesktop", {
			value: {
				platform: "darwin",
				chooseDirectory: async () => null,
				status: async () => (window as unknown as { desktopStatus: DesktopStatus }).desktopStatus,
				serviceStatus: async () => {
					const state = window as unknown as {
						desktopService: DesktopServiceStatus;
						desktopServiceError?: string;
					};
					if (state.desktopServiceError) throw new Error(state.desktopServiceError);
					return state.desktopService;
				},
				updateStatus: async () => (window as unknown as { desktopUpdate: DesktopUpdateStatus }).desktopUpdate,
				setOpenAtLogin: async (enabled: boolean) => {
					calls.push(["setOpenAtLogin", enabled]);
				},
				run: async (action: string) => {
					calls.push(["run", action]);
					if (action === "resumeLocalWork")
						throw new Error("Error invoking remote method 'trellis:desktop-action': Error: Local work stays paused.");
				},
				onNavigate: (listener: (path: string) => void) => {
					(window as unknown as { desktopNavigate: (path: string) => void }).desktopNavigate = listener;
					return () => {};
				},
			},
		});
	}, value);

const calls = (page: Page) => page.evaluate(() => (window as unknown as { desktopCalls: unknown[][] }).desktopCalls);

test("a browser shows no Desktop settings", async ({ page }) => {
	await signIn(page, "/settings#desktop");
	await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Account" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Desktop", exact: true })).toHaveCount(0);
});

test("desktop settings show the app state and run each desktop action", async ({ page }) => {
	await installBridge(page, { status: packaged, service: packagedService, update: packagedUpdate });
	await signIn(page, "/settings#desktop");
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section.getByText("/Users/dana/.trellis", { exact: true })).toBeVisible();
	await expect(section.getByText("Needs approval in Login Items", { exact: true })).toBeVisible();
	await expect(section.getByText("Restart required", { exact: true })).toBeVisible();
	await expect(section.getByText("The previous host still runs.", { exact: true })).toBeVisible();
	await expect(section.getByText("Package 1.2.3, release abcdef123456, runtime protocol 3")).toBeVisible();
	const login = section.getByRole("switch", { name: "Open Trellis at login" });
	await expect(login).not.toBeChecked();
	await login.click();
	const actions = [
		["Show data directory", "showDataDirectory"],
		["Choose data directory", "chooseDataDirectory"],
		["Open Login Items in System Settings", "openServiceSettings"],
		["Stop local work and background service", "stopLocalWork"],
		["Reconnect host", "reconnectHost"],
		["Quit Trellis (keep agents running)", "quit"],
	];
	for (const [label] of actions) await section.getByRole("button", { name: label, exact: true }).click();
	await expect
		.poll(() => calls(page))
		.toEqual([["setOpenAtLogin", true], ...actions.map(([, action]) => ["run", action])]);
	await section.getByRole("button", { name: "Resume local work", exact: true }).click();
	await expect(page.getByText("Local work stays paused.", { exact: true })).toBeVisible();
});

// The focus event models a return from System Settings after service approval.
test("desktop settings read the status again when the window regains focus", async ({ page }) => {
	await installBridge(page, { status: packaged, service: packagedService, update: packagedUpdate });
	await signIn(page, "/settings#desktop");
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section.getByText("Needs approval in Login Items", { exact: true })).toBeVisible();
	await page.evaluate(() => {
		(window as unknown as { desktopService: DesktopServiceStatus }).desktopService = "enabled";
		window.dispatchEvent(new Event("focus"));
	});
	await expect(section.getByText("Enabled", { exact: true })).toBeVisible();
	await expect(calls(page)).resolves.toEqual([]);
});

test("a service status error keeps the desktop actions available", async ({ page }) => {
	await installBridge(page, {
		status: packaged,
		update: packagedUpdate,
		serviceError: "The background service did not answer.",
	});
	await signIn(page, "/settings#desktop");
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section.getByText("The background service did not answer.", { exact: true })).toBeVisible();
	await expect(section.getByText("Restart required", { exact: true })).toBeVisible();
	await expect(section.getByRole("button", { name: "Show data directory", exact: true })).toBeEnabled();
	await expect(
		section.getByRole("button", { name: "Stop local work and background service", exact: true }),
	).toBeEnabled();
});

test("desktop navigation changes the route without a page load", async ({ page }) => {
	await installBridge(page, { status: packaged, service: packagedService, update: packagedUpdate });
	await signIn(page, "/settings#account");
	const navigationEntries = await page.evaluate(() => performance.getEntriesByType("navigation").length);
	await page.evaluate(() =>
		(window as unknown as { desktopNavigate: (path: string) => void }).desktopNavigate("/settings#desktop"),
	);
	await expect(page.getByRole("region", { name: "Desktop" })).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => performance.getEntriesByType("navigation").length))
		.toBe(navigationEntries);
});

test("the development app disables the package settings", async ({ page }) => {
	await installBridge(page, { status: { ...packaged, packaged: false } });
	await signIn(page, "/settings#desktop");
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section.getByRole("button", { name: "Choose data directory", exact: true })).toBeDisabled();
	await expect(
		section.getByRole("button", { name: "Open Login Items in System Settings", exact: true }),
	).toBeDisabled();
	await expect(section.getByRole("switch", { name: "Open Trellis at login" })).toBeDisabled();
	await expect(section.getByText("The development app has no package.", { exact: true })).toBeVisible();
	await expect(section.getByRole("button", { name: "Show data directory", exact: true })).toBeEnabled();
});
