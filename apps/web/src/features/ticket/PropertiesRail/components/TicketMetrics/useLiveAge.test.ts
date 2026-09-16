import { expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { createFakeScheduler } from "../../../../../../test/fakeScheduler";
import { useLiveAge } from "./useLiveAge";

test("ticket age updates at a display boundary without another query result", () => {
	const clock = createFakeScheduler();
	const initialProps: { ageMs: number | null } = { ageMs: 59_999 };
	const hook = renderHook(({ ageMs }: { ageMs: number | null }) => useLiveAge(ageMs, clock.scheduler), {
		initialProps,
	});
	expect(hook.result.current).toBe(59_999);
	act(() => clock.advanceTo(1));
	expect(hook.result.current).toBe(60_000);
	expect(clock.pendingTimers()).toBe(1);
	hook.rerender({ ageMs: null });
	expect(hook.result.current).toBeNull();
	expect(clock.pendingTimers()).toBe(0);
});
