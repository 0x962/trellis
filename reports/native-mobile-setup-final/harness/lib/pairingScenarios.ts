import { type Scenario, success, validName } from "./fixture";

export const pairingScenarios: Scenario[] = [
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
					throw new Error(
						`The ${active.name} control has no visible keyboard focus evidence: ${JSON.stringify(active)}`,
					);
				}
				if (index < 4) await page.keyboard.press("Tab");
			}
			const expected = ["Server URL", "Scan pair code", "Test connection", "Your name", "Save server"];
			if (JSON.stringify(order) !== JSON.stringify(expected))
				throw new Error(`Tab order from Server URL: ${JSON.stringify(order)}`);
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
		expected: [
			"final-version-with-a-deliberately-long-build-identity-2026.10.07",
			"987654 tickets",
			"Server default actor",
		],
		run: async (page) => {
			await success(page, validName);
			const version = page.getByText("Version", { exact: true });
			await version.evaluate((element: HTMLElement) => element.scrollIntoView({ block: "start" }));
			await page.waitForTimeout(80);
			const names = [
				"Version",
				"final-version-with-a-deliberately-long-build-identity-2026.10.07",
				"Tickets",
				"987654 tickets",
				"Server default actor",
				"Synthetic Person With A Deliberately Long Browser Baseline Identity",
			];
			const detailBoxes: Record<string, unknown> = {};
			for (const name of names) detailBoxes[name] = await page.getByText(name, { exact: true }).boundingBox();
			const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollY }));
			for (const [name, box] of Object.entries(detailBoxes)) {
				const value = box as any;
				if (value === null || value.y < 0 || value.y + value.height > viewport.height)
					throw new Error(`${name} is outside the captured viewport.`);
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
