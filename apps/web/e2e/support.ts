import type { Locator, Page } from "@playwright/test";

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

// A board column. Its accessible name is the column name, a comma, and
// the ticket count.
export const columnOf = (page: Page, name: string) => page.getByRole("list", { name: new RegExp(`^${name},`) });

// A board card inside `scope`. Its accessible name is the identifier, a
// space, and the title.
export const cardOf = (scope: Page | Locator, identifier: string) =>
	scope.getByRole("listitem", { name: new RegExp(`^${identifier} `) });

// The identifiers of the cards in a column, top to bottom.
export const cardOrder = (column: Locator) =>
	column
		.getByRole("listitem")
		.evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")!.split(" ")[0]!));

// A toast with `text`. The board's live region announces the same text,
// so the locator names the toast element itself.
export const toastOf = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text });
