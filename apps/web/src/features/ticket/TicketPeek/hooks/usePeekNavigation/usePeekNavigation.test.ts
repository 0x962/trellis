import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { press } from "../../../../../../test/keyboard";
import { usePeekNavigation } from "./usePeekNavigation";

type Row = { identifier: string; visible: boolean };

const visible = (identifier: string): Row => ({ identifier, visible: true });
const hidden = (identifier: string): Row => ({ identifier, visible: false });

// The hook takes the rows the list renders, the identifier the peek shows,
// and the step callback. It binds j and k while it is mounted.
const setup = (rows: Row[], current: string) => {
	const onStep = mock((_identifier: string) => {});
	renderHook(() => usePeekNavigation({ rows, current, onStep }));
	return onStep;
};

describe("features/ticket/TicketPeek/hooks/usePeekNavigation", () => {
	// WT-07. The walk has no wrap: the ends hold.
	test("stops at the last row and at the first row", () => {
		const rows = ["CDE-1", "CDE-2", "CDE-3", "CDE-4", "CDE-5"].map(visible);
		const atEnd = setup(rows, "CDE-5");
		press("j");
		expect(atEnd).not.toHaveBeenCalled();
		press("k");
		expect(atEnd).toHaveBeenCalledWith("CDE-4");
		const atStart = setup(rows, "CDE-1");
		press("k");
		expect(atStart).not.toHaveBeenCalled();
		press("j");
		expect(atStart).toHaveBeenCalledWith("CDE-2");
	});

	// WT-08. A collapsed Done group hides its rows. The walk lands on the
	// next row a person can see.
	test("walks only the rows the list shows", () => {
		const rows = [
			visible("CDE-44"),
			visible("CDE-43"),
			hidden("CDE-48"),
			hidden("CDE-49"),
			visible("CDE-50"),
			hidden("CDE-33"),
		];
		const forward = setup(rows, "CDE-43");
		press("j");
		expect(forward).toHaveBeenCalledTimes(1);
		expect(forward).toHaveBeenCalledWith("CDE-50");
		const back = setup(rows, "CDE-50");
		press("k");
		expect(back).toHaveBeenCalledWith("CDE-43");
		const last = setup(rows, "CDE-50");
		press("j");
		expect(last).not.toHaveBeenCalled();
	});

	// WT-15. A j or k step shows a ticket whose detail is already cached, so
	// the step never waits for the network. The rows a person can see on each
	// side of the shown row load while the peek shows it.
	test("loads the visible rows on each side of the shown row", () => {
		const rows = [visible("CDE-1"), hidden("CDE-2"), visible("CDE-3"), visible("CDE-4"), visible("CDE-5")];
		const onPrefetch = mock((_identifier: string) => {});
		renderHook(() => usePeekNavigation({ rows, current: "CDE-3", onStep: () => {}, onPrefetch }));
		expect(onPrefetch.mock.calls.map(([identifier]) => identifier).sort()).toEqual(["CDE-1", "CDE-4"]);
		const atEnd = mock((_identifier: string) => {});
		renderHook(() => usePeekNavigation({ rows, current: "CDE-5", onStep: () => {}, onPrefetch: atEnd }));
		expect(atEnd.mock.calls.map(([identifier]) => identifier)).toEqual(["CDE-4"]);
	});
});
