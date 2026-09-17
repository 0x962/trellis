import { expect, test } from "@playwright/test";
import type { Persona, Project } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("column worker defaults persist and project names have no chat action", async ({ page }) => {
	const persona = await post<Persona>("/personas", {
		name: "Column reviewer",
		kind: "reviewer",
		instruction: "Review on assignment.",
	});
	await post("/projects", { key: "COLW", name: "Column workers" });
	await signIn(page, "/p/COLW/settings#statuses");
	await page.getByRole("button", { name: "Edit Agent Review", exact: true }).click();
	const form = page.getByRole("form", { name: "Edit Agent Review", exact: true });
	await form.getByRole("combobox", { name: "Worker persona", exact: true }).click();
	await page.getByRole("option", { name: persona.name, exact: true }).click();
	await form.getByRole("combobox", { name: "Harness", exact: true }).click();
	await page.getByRole("option", { name: "Codex", exact: true }).click();
	await form.getByRole("combobox", { name: "Model", exact: true }).click();
	await page.getByRole("option", { name: "openai/gpt-5.6-sol", exact: true }).click();
	await form.getByRole("combobox", { name: "Reasoning effort", exact: true }).click();
	await page.getByRole("option", { name: "High", exact: true }).click();
	await form.getByRole("spinbutton", { name: "WIP limit for Agent Review" }).fill("3");
	await form.getByRole("button", { name: "Save status", exact: true }).click();
	await expect(form).toBeHidden();
	await expect
		.poll(async () => (await get<Project>("/projects/COLW")).statuses.find((status) => status.name === "Agent Review"))
		.toMatchObject({
			wipLimit: 3,
			agentConfig: {
				personaId: persona.id,
				harness: { preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" },
				accountId: null,
			},
		});
	await page.reload();
	await page.getByRole("button", { name: "Edit Agent Review", exact: true }).click();
	await expect(form.getByRole("combobox", { name: "Worker persona", exact: true })).toContainText(persona.name);
	await expect(form.getByRole("combobox", { name: "Reasoning effort", exact: true })).toContainText("High");
	for (const status of ["Done", "Canceled"]) {
		await page.getByRole("button", { name: `Edit ${status}`, exact: true }).click();
		const terminalForm = page.getByRole("form", { name: `Edit ${status}`, exact: true });
		await expect(terminalForm.getByRole("combobox", { name: "Worker persona", exact: true })).toHaveCount(0);
		await terminalForm.getByRole("button", { name: "Cancel", exact: true }).click();
	}
	await page.getByRole("button", { name: "Add a status to Todo", exact: true }).click();
	const todoCreateForm = page.getByRole("region", { name: "Todo", exact: true }).locator(".status-create-form");
	await expect(todoCreateForm.getByRole("combobox", { name: "Worker persona", exact: true })).toBeVisible();
	await todoCreateForm.getByRole("button", { name: "Cancel", exact: true }).click();
	await page.getByRole("button", { name: "Add a status to Done", exact: true }).click();
	const doneCreateForm = page.getByRole("region", { name: "Done", exact: true }).locator(".status-create-form");
	await expect(doneCreateForm.getByRole("combobox", { name: "Worker persona", exact: true })).toHaveCount(0);
	await doneCreateForm.getByRole("button", { name: "Cancel", exact: true }).click();
	const before = page.url();
	await page
		.locator('[data-slot="label"]')
		.filter({ hasText: /^Column workers$/ })
		.click();
	expect(page.url()).toBe(before);
	await page.goto("/p/COLW/settings#manager");
	await expect(page.getByRole("combobox", { name: "Copilot persona", exact: true })).toBeVisible();
	await expect(page.getByRole("switch", { name: "Automatic dispatch", exact: true })).toHaveCount(0);
	await page.goto("/p/COLW/settings/manager");
	await expect(
		page.getByRole("button", { name: /^(Start|Stop|Resume) manager$|Restart with new context/ }),
	).toHaveCount(0);
});
