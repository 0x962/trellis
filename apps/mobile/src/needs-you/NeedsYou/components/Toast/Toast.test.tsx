import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Toast } from "./Toast";

const title = "Cannot move CDE-42 to Done";
const detail = "The ticket changed since the version you sent.";

describe("Toast", () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	// MI-34. An error toast lives 6 s; a success toast lives 3 s.
	test("a toast shows its two lines, its action, and its own lifetime", async () => {
		// The lifetime check steps time by hand, so the clock must not move on its own.
		jest.useFakeTimers({ advanceTimers: false });
		const onDismiss = jest.fn();
		const onRetry = jest.fn();
		const error = await render(
			<Toast
				tone="error"
				title={title}
				detail={detail}
				action={{ label: "Retry", onPress: onRetry }}
				onDismiss={onDismiss}
			/>,
		);
		expect(screen.getByTestId("toast")).toBeOnTheScreen();
		expect(screen.getByText(title)).toBeOnTheScreen();
		expect(screen.getByText(detail)).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		await act(async () => {
			jest.advanceTimersByTime(5_999);
		});
		expect(onDismiss).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(1);
		});
		expect(onDismiss).toHaveBeenCalledTimes(1);
		await error.unmount();

		const onDone = jest.fn();
		await render(<Toast tone="success" title="Approved CDE-42" onDismiss={onDone} />);
		await act(async () => {
			jest.advanceTimersByTime(2_999);
		});
		expect(onDone).not.toHaveBeenCalled();
		await act(async () => {
			jest.advanceTimersByTime(1);
		});
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});
