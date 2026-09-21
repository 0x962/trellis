import { describe, expect, test } from "bun:test";
import { type ColumnId, disclosureTrack, gridStyle, isEpicTable } from "./columns";

const epic: ColumnId[] = ["select", "status", "id", "title", "waits", "releases", "actor", "updated"];
const list: ColumnId[] = ["select", "status", "id", "title", "priority", "updated"];

// `minmax(0, 1fr)` holds a space of its own, so the split drops the space
// after the comma first.
const tracks = (value: unknown) => String(value).replace(/,\s/g, ",").split(" ");

describe("the grid of a row", () => {
	test("an epic row keeps one track more than it has columns, for the caret", () => {
		const style = gridStyle(epic) as Record<string, string>;

		expect(tracks(style["--grid-wide"]).length).toBe(epic.length + 1);
		expect(tracks(style["--grid-wide"]).at(-1)).toBe(disclosureTrack);
	});

	test("the narrow tracks of an epic row keep the caret track too", () => {
		const style = gridStyle(epic) as Record<string, string>;

		expect(tracks(style["--grid-narrow"]).at(-1)).toBe(disclosureTrack);
	});

	test("a list row has one track per column", () => {
		const style = gridStyle(list) as Record<string, string>;

		expect(tracks(style["--grid-wide"]).length).toBe(list.length);
		expect(tracks(style["--grid-wide"]).at(-1)).not.toBe(disclosureTrack);
	});

	test("a list row keeps the full status column, and an epic row draws the icon alone", () => {
		expect(tracks((gridStyle(list) as Record<string, string>)["--grid-wide"])[1]).toBe("140px");
		expect(tracks((gridStyle(epic) as Record<string, string>)["--grid-wide"])[1]).toBe("28px");
	});

	test("only a table with the waits or the releases column is an epic table", () => {
		expect(isEpicTable(epic)).toBe(true);
		expect(isEpicTable(list)).toBe(false);
	});
});
