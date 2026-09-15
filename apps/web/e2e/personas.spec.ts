import { expect, test } from "@playwright/test";
import type { Persona } from "@trellis/api";
import { get, post } from "./api";
import { signIn } from "./support";

test("a persona saves a color and a description, and the card shows the description", async ({ page }) => {
	const name = `Docs writer ${crypto.randomUUID()}`;
	await signIn(page, "/ai/personas");
	await page.getByRole("button", { name: "New persona", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "New persona", exact: true });
	await sheet.getByRole("textbox", { name: "Name", exact: true }).fill(name);
	await sheet.getByRole("textbox", { name: "Description", exact: true }).fill("Writes the reference pages.");
	await sheet.getByRole("combobox", { name: "Color", exact: true }).click();
	await page.getByRole("option", { name: "Success", exact: true }).click();
	await sheet.getByRole("textbox", { name: "Instruction", exact: true }).fill("Write the docs.");
	await sheet.getByRole("button", { name: "Create persona", exact: true }).click();
	await expect(sheet).toHaveCount(0);
	expect((await get<Persona[]>("/personas")).find((persona) => persona.name === name)).toMatchObject({
		color: "success",
		description: "Writes the reference pages.",
	});
	// The card carries the description a person wrote, and keeps the long
	// instruction for the editor.
	const card = page.getByRole("article", { name, exact: true });
	await expect(card).toContainText("Writes the reference pages.");
	await expect(card).not.toContainText("Write the docs.");
	await card.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
	const editor = page.getByRole("dialog", { name: "Edit persona", exact: true });
	await expect(editor.getByRole("textbox", { name: "Description", exact: true })).toHaveValue(
		"Writes the reference pages.",
	);
	await expect(editor.getByRole("combobox", { name: "Color", exact: true })).toContainText("Success");
});

test("a persona without a description shows its instruction on the card", async ({ page }) => {
	const name = `Plain ${crypto.randomUUID()}`;
	await post("/personas", { name, kind: "builder", instruction: "Make the tests pass." });
	await signIn(page, "/ai/personas");
	await expect(page.getByRole("article", { name, exact: true })).toContainText("Make the tests pass.");
});
