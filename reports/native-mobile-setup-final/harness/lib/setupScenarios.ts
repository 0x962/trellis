import {
	baseUrl,
	controls,
	emptyNameError,
	fillValid,
	fixtureUrl,
	oldUrl,
	replacementWarning,
	type Scenario,
	success,
	validName,
} from "./fixture";

const negativeControl = process.env.TRL1420_NEGATIVE_CONTROL;

const requireDisabledSave = async (page: any) => {
	const save = page.getByRole("button", { name: "Save server" });
	const saveDisabled = negativeControl === "save-enabled" ? false : await save.isDisabled();
	if (!saveDisabled) throw new Error("Save server is enabled without a valid name.");
	return saveDisabled;
};

export const setupScenarios: Scenario[] = [
	{
		id: "fresh-setup",
		title: "Fresh setup and disabled Save server",
		expected: ["Server URL", "Scan pair code", "Test connection", "Your name", "Save server"],
		run: async (page) => ({ saveDisabled: await requireDisabledSave(page) }),
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
			return { emptyNameError, saveDisabled: await requireDisabledSave(page) };
		},
	},
	{
		id: "connection-progress",
		title: "Connection progress",
		mode: "delay",
		expected: ["Testing connection…"],
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
		expectedNetworkError: { errorText: "net::ERR_ABORTED" },
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
		expectedNetworkError: {
			errorText: "net::ERR_CONNECTION_REFUSED",
			consoleMessage: "Failed to load resource: net::ERR_CONNECTION_REFUSED",
		},
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
				for (const key of ["x", "y", "width", "height"])
					largestShift = Math.max(largestShift, Math.abs(before[key] - after[key]));
			}
			if (largestShift !== 0) throw new Error(`Control shift is ${largestShift}px.`);
			return {
				controlBoundsBefore: bounds.before,
				controlBoundsAfter: bounds.after,
				largestControlShift: largestShift,
			};
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
			if (warningBox === null || saveBox === null)
				throw new Error("Replacement warning or Save server is not rendered.");
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
			await page.goto(`${baseUrl}/setup`, { waitUntil: "domcontentloaded" });
			await page.getByRole("textbox", { name: "Server URL" }).waitFor();
			await page.reload({ waitUntil: "domcontentloaded" });
			const url = await page.getByRole("textbox", { name: "Server URL" }).inputValue();
			const name = await page.getByRole("textbox", { name: "Your name" }).inputValue();
			if (url !== fixtureUrl || name !== validName) throw new Error("Saved setup values did not survive reload.");
			return { retained: { url, name } };
		},
	},
];
