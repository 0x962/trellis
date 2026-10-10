import { expect, userEvent, waitFor, within } from "storybook/test";

export async function checkAccountNames({ canvasElement }: { canvasElement: HTMLElement }) {
	const page = within(canvasElement.ownerDocument.body);
	await expect(await page.findByRole("option", { name: /avery@example.test.*Primary/ })).toBeVisible();
	await expect(await page.findByRole("option", { name: /avery@example.test.*Team/ })).toBeVisible();
	const current = page.getByRole("option", { name: /avery@example.test.*Primary/ });
	await expect(current).toHaveAttribute("data-checked", "true");
	await expect(current.scrollWidth).toBeLessThanOrEqual(current.clientWidth);
	await expect(current.querySelector("span.truncate")!.getBoundingClientRect().width).toBeGreaterThan(0);
	await expect(current.querySelector("svg")!.getBoundingClientRect().right).toBeLessThanOrEqual(
		current.getBoundingClientRect().right,
	);
	for (const detail of ["avery@example.test", "Five hours: 28% used"]) {
		const text = page.getByText(detail, { exact: true });
		await expect(text).toBeVisible();
		await expect(text.getBoundingClientRect().width).toBeGreaterThan(0);
	}
	const search = page.getByRole("combobox", { name: "Search accounts" });
	await userEvent.type(search, "No such account");
	await expect(await page.findByRole("option", { name: 'Create account "No such account"' })).toBeVisible();
	await expect(page.queryByRole("option", { name: /avery@example.test.*Primary/ })).not.toBeInTheDocument();
	await expect(page.queryByRole("option", { name: /avery@example.test.*Team/ })).not.toBeInTheDocument();
	await userEvent.clear(search);
	await userEvent.type(search, "Team");
	await userEvent.keyboard("{ArrowDown}{Enter}");
	await waitFor(() => expect(page.getByRole("dialog", { name: "Switch to Team?" })).toBeVisible());
}
