import { describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { Ticket } from "@trellis/api";
import { createFakeScheduler } from "../../../../../../test/fakeScheduler";
import { ticket } from "../../../../../../test/fixtures";
import { useDescriptionAutosave } from "./useDescriptionAutosave";

// The hook takes the cached ticket for its version and stale flag, a `save`
// that runs the mutation, and the clock the test controls.
const setup = (overrides: Record<string, unknown> = {}) => {
	const clock = createFakeScheduler();
	const save = mock((_markdown: string, _expectedVersion: number) => Promise.resolve());
	const row = ticket({ version: 17, ...overrides }) as unknown as Ticket;
	const hook = renderHook(() => useDescriptionAutosave({ ticket: row, save, scheduler: clock.scheduler }));
	return { ...clock, save, hook };
};

describe("features/ticket/Description/hooks/useDescriptionAutosave", () => {
	// WT-37
	test("autosaves 800 ms after the last keystroke with expectedVersion", () => {
		const { hook, save, advanceTo } = setup();
		act(() => hook.result.current.onChange("# Edited"));
		act(() => advanceTo(799));
		expect(save).not.toHaveBeenCalled();
		act(() => advanceTo(800));
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("# Edited", 17);
	});

	// WT-38. Every keystroke restarts the window; a burst saves once.
	test("a second keystroke restarts the 800 ms window", () => {
		const { hook, save, advanceTo } = setup();
		act(() => hook.result.current.onChange("# Edit"));
		act(() => advanceTo(300));
		act(() => hook.result.current.onChange("# Edited"));
		act(() => advanceTo(300 + 799));
		expect(save).not.toHaveBeenCalled();
		act(() => advanceTo(300 + 800));
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("# Edited", 17);
		act(() => advanceTo(5000));
		expect(save).toHaveBeenCalledTimes(1);
	});

	// WT-39. Blur saves at once and drops the pending timer.
	test("blur saves the description before the timer", () => {
		const { hook, save, advanceTo, pendingTimers } = setup();
		act(() => hook.result.current.onChange("# Edited"));
		act(() => advanceTo(200));
		act(() => hook.result.current.onBlur());
		expect(save).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledWith("# Edited", 17);
		expect(pendingTimers()).toBe(0);
		act(() => advanceTo(2000));
		expect(save).toHaveBeenCalledTimes(1);
	});
});
