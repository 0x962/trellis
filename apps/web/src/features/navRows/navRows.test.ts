import { describe, expect, test } from "bun:test";
import { Ticket } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { navRows } from "./navRows";

describe("features/navRows", () => {
	// The static shell fallback and the loaded sidebar draw the same eight
	// destinations, so one list feeds both and the icons cannot drift.
	test("holds the eight destinations in order with one shared /all icon", () => {
		expect(navRows.map((row) => row.to)).toEqual([
			"/needs-you",
			"/search",
			"/all",
			"/reviews",
			"/ai/personas",
			"/ai/flows",
			"/loops",
			"/usage",
		]);
		expect(navRows.map((row) => row.label)).toEqual([
			"Needs you",
			"Search",
			"All tickets",
			"Pull requests",
			"Personas",
			"Flows",
			"Loops",
			"Usage",
		]);
		const all = navRows.find((row) => row.to === "/all")!;
		expect((all.icon as ReactElement).type).toBe(Ticket);
	});
});
