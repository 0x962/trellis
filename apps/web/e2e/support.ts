import type { Page } from "@playwright/test";

// The localStorage key and value the setup name step writes
// (src/lib/actor.ts). The init script runs before any page script, so the
// root route sees an actor and never redirects to /setup.
const actorScript = `localStorage.setItem("trellis.actor", JSON.stringify({ name: "navid", kind: "human" }));`;

export const signIn = async (page: Page, path: string) => {
	await page.addInitScript(actorScript);
	await page.goto(path);
};

// The list row of a ticket in the project table.
export const rowOf = (page: Page, identifier: string) => page.locator(`[role="row"][data-identifier="${identifier}"]`);

export const peekOf = (page: Page, identifier: string) => page.getByRole("dialog", { name: identifier });
