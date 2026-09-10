import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SectionHeader } from "./SectionHeader";

const header = (name: string) => screen.getByRole("button", { name });

describe("SectionHeader", () => {
	// MI-13. The approved design shows "swipe to act" on the Review header.
	test("the review header carries the swipe hint", async () => {
		await render(<SectionHeader name="Review" count={3} hint="swipe to act" open onToggle={() => {}} />);
		expect(within(header("Review")).getByText("swipe to act")).toBeOnTheScreen();
		expect(within(header("Review")).getByText("3")).toBeOnTheScreen();
	});

	// MI-16
	test("a section header is a button that reports its expanded state", async () => {
		const onToggle = jest.fn();
		const open = await render(
			<SectionHeader name="Done by agents today" count={1234} hint="Hide" open onToggle={onToggle} />,
		);
		expect(header("Done by agents today")).toBeExpanded();
		const count = within(header("Done by agents today")).getByText(new Intl.NumberFormat().format(1234));
		const style = StyleSheet.flatten(count.props.style) as { fontVariant?: string[] };
		expect(style.fontVariant).toContain("tabular-nums");
		await fireEvent.press(header("Done by agents today"));
		expect(onToggle).toHaveBeenCalledTimes(1);
		await open.unmount();

		await render(
			<SectionHeader name="Done by agents today" count={6} hint="Show 6" open={false} onToggle={onToggle} />,
		);
		expect(header("Done by agents today")).toBeCollapsed();
		expect(within(header("Done by agents today")).getByText("Show 6")).toBeOnTheScreen();
	});
});
