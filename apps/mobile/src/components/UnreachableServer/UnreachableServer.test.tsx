import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { serverHost } from "../../../test/server";
import { UnreachableServer } from "./UnreachableServer";

describe("UnreachableServer", () => {
	test("the screen names the host and offers the two actions", async () => {
		const onRetry = jest.fn();
		const onChangeServer = jest.fn();
		await render(<UnreachableServer host={serverHost} onRetry={onRetry} onChangeServer={onChangeServer} />);
		expect(screen.getByText(`Cannot reach ${serverHost}`)).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await fireEvent.press(screen.getByRole("button", { name: "Change server" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
		expect(onChangeServer).toHaveBeenCalledTimes(1);
	});
});
