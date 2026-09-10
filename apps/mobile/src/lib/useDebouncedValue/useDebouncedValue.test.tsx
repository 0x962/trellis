import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { act, render } from "@testing-library/react-native";
import { debounceMs, useDebouncedValue } from "./useDebouncedValue";

// Every value the hook returns, in render order.
const emitted: string[] = [];

function Probe({ value }: { value: string }) {
	emitted.push(useDebouncedValue(value));
	return null;
}

afterEach(() => {
	emitted.length = 0;
	jest.useRealTimers();
});

describe("useDebouncedValue", () => {
	test("five changes inside the window emit one value", async () => {
		jest.useFakeTimers();
		expect(debounceMs).toBe(120);
		const { rerender } = await render(<Probe value="" />);

		for (const value of ["o", "oa", "oau", "oaut", "oauth"]) {
			rerender(<Probe value={value} />);
			act(() => jest.advanceTimersByTime(20));
		}
		// 100 ms after the first keystroke, and 20 ms after the last one.
		expect(new Set(emitted)).toEqual(new Set([""]));

		act(() => jest.advanceTimersByTime(debounceMs));
		expect(emitted[emitted.length - 1]).toBe("oauth");
		expect(new Set(emitted)).toEqual(new Set(["", "oauth"]));
	});

	test("an empty value emits without a wait", async () => {
		jest.useFakeTimers();
		const { rerender } = await render(<Probe value="" />);
		rerender(<Probe value="oauth" />);
		act(() => jest.advanceTimersByTime(debounceMs));
		expect(emitted[emitted.length - 1]).toBe("oauth");

		rerender(<Probe value="" />);
		expect(emitted[emitted.length - 1]).toBe("");
	});
});
