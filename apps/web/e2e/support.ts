import type { Locator, Page } from "@playwright/test";
import { get, put } from "./api";

const actorName = "navid";

type Settings = { defaultActorName: string; stalledHours: number };

// The localStorage key and value the setup name step writes
// (src/lib/actor.ts). The init script runs before any page script, so the
// root route sees an actor and never redirects to /setup.
const actorScript = `localStorage.setItem("trellis.actor", JSON.stringify({ name: "${actorName}", kind: "human" }));`;

// All specs share one server. The app replaces the browser's name with the
// server's `defaultActorName` (resolveActor in src/lib/identity.ts), so
// signIn stores the same name on the server. A spec that renamed the actor
// then cannot change the name that a later spec acts as. PUT /settings
// replaces the whole record, so the write keeps every other setting.
export const signIn = async (page: Page, path: string) => {
	const settings = await get<Settings>("/settings");
	await put("/settings", { ...settings, defaultActorName: actorName });
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
