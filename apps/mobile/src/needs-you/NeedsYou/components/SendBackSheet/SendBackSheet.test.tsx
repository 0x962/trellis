import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SendBackSheet } from "./SendBackSheet";

const prompt = "What should change?";
const sendBack = () => screen.getByRole("button", { name: "Send back" });

describe("SendBackSheet", () => {
	// MI-37
	test("cancel closes the sheet and keeps the row", async () => {
		const onCancel = jest.fn();
		const onSubmit = jest.fn();
		await render(<SendBackSheet identifier="CDE-42" visible onCancel={onCancel} onSubmit={onSubmit} />);
		expect(screen.getByPlaceholderText(prompt)).toBeOnTheScreen();
		await fireEvent.changeText(screen.getByPlaceholderText(prompt), "Fix the failing typecheck");
		await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	// MI-38
	test("send back stays disabled until the comment holds text", async () => {
		const onSubmit = jest.fn();
		await render(<SendBackSheet identifier="CDE-42" visible onCancel={() => {}} onSubmit={onSubmit} />);
		expect(sendBack()).toBeDisabled();
		await fireEvent.press(sendBack());
		expect(onSubmit).not.toHaveBeenCalled();
		await fireEvent.changeText(screen.getByPlaceholderText(prompt), "x");
		expect(sendBack()).toBeEnabled();
		await fireEvent.press(sendBack());
		expect(onSubmit).toHaveBeenCalledWith("x");
	});

	test("a hidden sheet renders no field", async () => {
		await render(<SendBackSheet identifier="CDE-42" visible={false} onCancel={() => {}} onSubmit={() => {}} />);
		expect(screen.queryByPlaceholderText(prompt)).toBeNull();
	});
});
