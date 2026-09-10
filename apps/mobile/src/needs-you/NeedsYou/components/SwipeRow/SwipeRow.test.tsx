import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { paintedColors } from "../../../../../test/paint";
import { holdLeft, holdRight, shortDragPx, swipeLeft, swipeRight } from "../../../../../test/swipe";
import { tokens } from "../../../../theme/tokens";
import { SwipeRow, type SwipeRowProps } from "./SwipeRow";

const renderRow = (props: Partial<SwipeRowProps> = {}) =>
	render(
		<GestureHandlerRootView>
			<SwipeRow identifier="CDE-42" {...props}>
				<Text>Restore the fork pages</Text>
			</SwipeRow>
		</GestureHandlerRootView>,
	);

describe("SwipeRow", () => {
	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	// MI-29
	test("a swipe reveals its action and fires only past the threshold", async () => {
		const onApprove = jest.fn();
		const onSendBack = jest.fn();
		await renderRow({ onApprove, onSendBack });

		await act(() => holdRight("CDE-42"));
		expect(screen.getByText("Approve")).toBeOnTheScreen();
		expect(screen.queryByText("Send back")).toBeNull();
		expect(paintedColors(screen.toJSON())).toContain(tokens.dark.success);

		await act(() => holdLeft("CDE-42"));
		expect(screen.getByText("Send back")).toBeOnTheScreen();
		expect(screen.queryByText("Approve")).toBeNull();

		await act(() => swipeRight("CDE-42", shortDragPx));
		await act(() => swipeLeft("CDE-42", shortDragPx));
		expect(onApprove).not.toHaveBeenCalled();
		expect(onSendBack).not.toHaveBeenCalled();

		await act(() => swipeRight("CDE-42"));
		expect(onApprove).toHaveBeenCalledTimes(1);
		expect(onSendBack).not.toHaveBeenCalled();
		await act(() => swipeLeft("CDE-42"));
		expect(onSendBack).toHaveBeenCalledTimes(1);
		expect(onApprove).toHaveBeenCalledTimes(1);
	});

	// MI-30. A Failing CI, Stalled, or Done row has no swipe action.
	test("a row outside the review section reveals no swipe action", async () => {
		await renderRow();
		await act(() => holdRight("CDE-42"));
		expect(screen.queryByText("Approve")).toBeNull();
		await act(() => holdLeft("CDE-42"));
		expect(screen.queryByText("Send back")).toBeNull();
		await act(() => swipeRight("CDE-42"));
		await act(() => swipeLeft("CDE-42"));
		expect(screen.queryByText("Approve")).toBeNull();
		expect(screen.queryByText("Send back")).toBeNull();
		expect(screen.getByText("Restore the fork pages")).toBeOnTheScreen();
	});

	// MI-31. The sweep is 200 ms; reduce motion makes it instant.
	test("the approve sweep runs 200 ms and becomes instant under reduce motion", async () => {
		jest.useFakeTimers();
		const onRemoved = jest.fn();
		const animated = await renderRow({ onApprove: () => {}, removing: true, onRemoved });
		await act(async () => {
			jest.advanceTimersByTime(199);
		});
		expect(onRemoved).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(1);
		});
		expect(onRemoved).toHaveBeenCalledTimes(1);
		await animated.unmount();

		jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
		const instant = jest.fn();
		await renderRow({ onApprove: () => {}, removing: true, onRemoved: instant });
		await act(async () => {
			await Promise.resolve();
		});
		expect(instant).toHaveBeenCalledTimes(1);
	});
});
