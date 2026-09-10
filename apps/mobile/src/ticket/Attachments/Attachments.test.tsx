import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { attachment, id } from "../../../test/fixtures";
import { Attachments } from "./Attachments";

const serverUrl = "http://h:4521";

describe("Attachments", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	// O37. The one attachment of CDE-42.
	test("an image attachment renders with expo-image", async () => {
		const png = attachment();
		await render(<Attachments attachments={[png]} serverUrl={serverUrl} />);
		const image = screen.getByTestId("attachment-image");
		expect(JSON.stringify(image.props.source)).toContain(`${serverUrl}${png.url}`);
		expect(screen.queryByRole("button")).toBeNull();
	});

	// O38.
	test("a file attachment opens in the system browser", async () => {
		const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
		const notes = attachment({
			id: id("A3"),
			filename: "notes.md",
			mime: "text/markdown",
			size: 2_048,
			url: `/api/attachments/${id("A3")}/file`,
		});
		await render(<Attachments attachments={[notes]} serverUrl={serverUrl} />);
		expect(screen.queryByTestId("attachment-image")).toBeNull();
		await fireEvent.press(screen.getByText("notes.md"));
		expect(openURL).toHaveBeenCalledTimes(1);
		expect(openURL).toHaveBeenCalledWith(`${serverUrl}${notes.url}`);
	});
});
