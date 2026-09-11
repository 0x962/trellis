import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { pullRequest } from "../../../test/fixtures";
import { PrCard } from "./PrCard";

describe("PrCard", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	// O35. Pull request 118 of CDE-42: four passing checks, approved.
	test("shows the repository, the number, the branch, the ribbon, and the review chip", async () => {
		await render(<PrCard pr={pullRequest()} />);
		expect(screen.getByText("acme/web #118")).toBeOnTheScreen();
		expect(screen.getByText("Restore the settings pages")).toBeOnTheScreen();
		expect(screen.getByText("cde-42-restore-settings-pages → main")).toBeOnTheScreen();
		expect(screen.getAllByTestId("ribbon-segment")).toHaveLength(4);
		expect(screen.getByLabelText("4 pass")).toBeOnTheScreen();
		expect(screen.getByText("4")).toBeOnTheScreen();
		expect(screen.getByText("Approved")).toBeOnTheScreen();
	});

	// O36.
	test("a tap opens the pull request in the system browser", async () => {
		const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
		const pr = pullRequest();
		await render(<PrCard pr={pr} />);
		await fireEvent.press(screen.getByText("acme/web #118"));
		expect(openURL).toHaveBeenCalledTimes(1);
		expect(openURL).toHaveBeenCalledWith(pr.url);
	});
});
