import { beforeEach, describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderApp } from "../../../../../renderWithProviders";
import { createTestServer } from "../../../../../server";

beforeEach(() => localStorage.clear());

const sizeToken = /\btext-(?:2xl|xl|lg|md|base|sm|xs)\b/;

const sizeOf = (element: Element) => sizeToken.exec(element.className)![0];

// TRL-43. The audit read the page title, the group header, and the card
// title at 14 px. Only the weight separated them, and the group header and
// the card title shared the weight too. The Settings page sets the ramp the
// page follows: the title at text-lg, the section title at text-xl, and the
// card title at text-base.
describe("features/personas/PersonasPage", () => {
	test("the title, the section title, and the card title take three sizes", async () => {
		const server = createTestServer({
			prepare: async (client) => {
				await client.personas.create({ name: "Bug Fixer", kind: "builder", instruction: "Fix the defect." });
			},
		});
		renderApp({ path: "/ai/personas", actor: "dana", server });
		const card = await screen.findByRole("heading", { level: 3, name: "Bug Fixer" });
		const title = screen.getByRole("heading", { level: 1, name: "Personas" });
		const section = screen.getByRole("heading", { level: 2, name: "Builders" });
		const sizes = [sizeOf(title), sizeOf(section), sizeOf(card)];
		expect(sizes).toEqual(["text-lg", "text-xl", "text-base"]);
		expect(new Set(sizes).size).toBe(3);
	});
});
