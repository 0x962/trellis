import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useRowSelection } from "./useRowSelection";

const ids = ["CDE-1", "CDE-2", "CDE-3", "CDE-4", "CDE-5", "CDE-6"];

const mount = (initial = ids) =>
	renderHook((input: { ids: string[] }) => useRowSelection({ ids: input.ids }), { initialProps: { ids: initial } });

const sorted = (values: string[]) => [...values].sort();

describe("features/table/hooks/useRowSelection", () => {
	// Outcome 38. `toggle` is what the x key calls on the focused row. The
	// rows reorder under a live patch, so the selection is a set of ids.
	test("toggles the focused row in the id-keyed selection with x", () => {
		const { result, rerender } = mount();
		act(() => result.current.toggle("CDE-2"));
		expect(result.current.selected).toEqual(["CDE-2"]);
		expect(result.current.isSelected("CDE-2")).toBe(true);
		act(() => result.current.toggle("CDE-2"));
		expect(result.current.selected).toEqual([]);
		expect(result.current.isSelected("CDE-2")).toBe(false);
		act(() => result.current.toggle("CDE-2"));
		rerender({ ids: [...ids].reverse() });
		expect(result.current.selected).toEqual(["CDE-2"]);
		expect(result.current.isSelected("CDE-5")).toBe(false);
	});

	// Outcome 39. `extend` is what Shift+j and Shift+k call with the row the
	// focus moved to. The range runs from the anchor row to that row.
	test("extends and shrinks the selection with Shift+j and Shift+k", () => {
		const { result } = mount();
		act(() => result.current.toggle("CDE-2"));
		act(() => result.current.extend("CDE-3"));
		act(() => result.current.extend("CDE-4"));
		expect(sorted(result.current.selected)).toEqual(["CDE-2", "CDE-3", "CDE-4"]);
		act(() => result.current.extend("CDE-3"));
		expect(sorted(result.current.selected)).toEqual(["CDE-2", "CDE-3"]);
		expect(result.current.isSelected("CDE-4")).toBe(false);
	});
});
