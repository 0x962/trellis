import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./support";

type Status = {
	packaged: boolean;
	dataDirectory: string;
	openAtLogin: boolean;
	service: string | null;
	update: { state: string; detail: string; version: string; release: string; protocol: number } | null;
};

const packaged: Status = {
	packaged: true,
	dataDirectory: "/Users/dana/.trellis",
	openAtLogin: false,
	service: "requiresApproval",
	update: {
		state: "restart-required",
		detail: "The previous host still runs.",
		version: "1.2.3",
		release: "abcdef123456",
		protocol: 3,
	},
};

// A stand-in for the preload bridge of the macOS app. Each call goes to
// window.desktopCalls, and each status call returns window.desktopStatus, so
// a test can change the status after the page loads. Resume local work fails
// the way an Electron IPC call fails, with the channel prefix before the
// message of the main process.
const installBridge = (page: Page, status: Status) =>
	page.addInitScript((value) => {
		const calls: unknown[][] = [];
		Object.defineProperty(window, "desktopCalls", { value: calls });
		Object.defineProperty(window, "desktopStatus", { value, writable: true });
		Object.defineProperty(window, "trellisDesktop", {
			value: {
				platform: "darwin",
				chooseDirectory: async () => null,
				status: async () => (window as unknown as { desktopStatus: Status }).desktopStatus,
				setOpenAtLogin: async (enabled: boolean) => {
					calls.push(["setOpenAtLogin", enabled]);
				},
				run: async (action: string) => {
					calls.push(["run", action]);
					if (action === "resumeLocalWork")
						throw new Error("Error invoking remote method 'trellis:desktop-action': Error: Local work stays paused.");
				},
			},
		});
	}, status);

const calls = (page: Page) => page.evaluate(() => (window as unknown as { desktopCalls: unknown[][] }).desktopCalls);

test("a browser shows no Desktop settings", async ({ page }) => {
	await signIn(page, "/settings#desktop");
	await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Account" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Desktop", exact: true })).toHaveCount(0);
});

test("desktop settings show the app state and run each former menu action", async ({ page }) => {
	await installBridge(page, packaged);
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

// The user approves the service in System Settings and returns to the app.
// The window regains focus, which fires visibilitychange, and the section
// reads the status again.
test("desktop settings read the status again when the window regains focus", async ({ page }) => {
	await installBridge(page, packaged);
	await signIn(page, "/settings#desktop");
	const section = page.getByRole("region", { name: "Desktop" });
	await expect(section.getByText("Needs approval in Login Items", { exact: true })).toBeVisible();
	await page.evaluate(() => {
		const target = window as unknown as { desktopStatus: Status };
		target.desktopStatus = { ...target.desktopStatus, service: "enabled" };
		document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
	});
	await expect(section.getByText("Enabled", { exact: true })).toBeVisible();
	await expect(calls(page)).resolves.toEqual([]);
});

test("the development app disables the package settings", async ({ page }) => {
	await installBridge(page, { ...packaged, packaged: false, service: null, update: null });
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
