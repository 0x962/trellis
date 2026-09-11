import { describe, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { ticket } from "../../../test/fixtures";
import { PropertyGrid } from "./PropertyGrid";

const parentTitle = "Update the shared build configuration";

describe("PropertyGrid", () => {
	// O29. CDE-42 as the ticket screen shows it.
	test("shows the status, the priority, the project path, and the parent", async () => {
		await render(
			<PropertyGrid
				ticket={ticket()}
				parentTitle={parentTitle}
				onStatusPress={jest.fn()}
				onPriorityPress={jest.fn()}
			/>,
		);
		for (const label of ["Status", "Priority", "Project", "Parent"]) {
			expect(screen.getByText(label)).toBeOnTheScreen();
		}
		expect(screen.getByText("Human Review")).toBeOnTheScreen();
		expect(screen.getByRole("image", { name: "Status: Human Review" })).toBeOnTheScreen();
		expect(screen.getByText("High")).toBeOnTheScreen();
		expect(screen.getByRole("image", { name: "Priority: high" })).toBeOnTheScreen();
		expect(screen.getByText("CDE.web")).toBeOnTheScreen();
		expect(screen.getByText("CDE-43")).toBeOnTheScreen();
		expect(screen.getByText(parentTitle)).toBeOnTheScreen();
	});

	// O30. The two editable rows are the two buttons.
	test("the status row and the priority row are buttons of 44 px", async () => {
		const onStatusPress = jest.fn();
		const onPriorityPress = jest.fn();
		await render(
			<PropertyGrid
				ticket={ticket()}
				parentTitle={parentTitle}
				onStatusPress={onStatusPress}
				onPriorityPress={onPriorityPress}
			/>,
		);
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(2);
		for (const name of ["Status", "Priority"]) {
			expect(screen.getByRole("button", { name })).toHaveStyle({ minHeight: 44 });
		}
		expect(screen.queryByRole("button", { name: "Project" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Parent" })).toBeNull();
	});
});
