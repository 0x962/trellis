import { expect, test } from "bun:test";
import { discoveryPosition } from "./discoveryPosition";

test("restores a filtered list after a visit to a flow", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
	const filters = { query: "Review Ω".repeat(1000), project: "TRL" };
	discoveryPosition.writeFilters(storage, filters);
	discoveryPosition.writeScroll(storage, 950);
	expect(discoveryPosition.readFilters(storage)).toEqual(filters);
	expect(discoveryPosition.readScroll(storage)).toBe(950);
	discoveryPosition.writeFilters(storage, { query: "", project: null });
	expect(discoveryPosition.readFilters(storage)).toEqual({ query: "", project: null });
	expect(discoveryPosition.readScroll(storage)).toBe(0);
});
