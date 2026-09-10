import { describe, expect, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ticket } from "../../../test/fixtures";
import { Description } from "./Description";

const markdown = ticket().description;

describe("Description", () => {
	// O31. The seeded description of CDE-42: a paragraph, a heading, a code
	// span, and a task list with two done items.
	test("renders the markdown heading, the code span, and the task list", async () => {
		await render(<Description markdown={markdown} />);
		expect(screen.getByText("Acceptance")).toBeOnTheScreen();
		expect(screen.getByText('grep -rn "CDE FORK"')).toBeOnTheScreen();
		expect(screen.getByText("The five routes render")).toBeOnTheScreen();
		expect(screen.getByText("The desktop typecheck is green")).toBeOnTheScreen();
		const items = screen.getAllByRole("checkbox");
		expect(items).toHaveLength(3);
		expect(items[0]).toBeChecked();
		expect(items[1]).toBeChecked();
		expect(items[2]).not.toBeChecked();
		expect(screen.queryByText(/\[x\]|\[ \]|##|`/)).toBeNull();
	});

	// O32. The description is read only on the phone.
	test("the description is read only and holds no text input", async () => {
		const view = await render(<Description markdown={markdown} />);
		expect(view.root!.queryAll((node) => node.type === "TextInput")).toHaveLength(0);
		const before = JSON.stringify(screen.toJSON());
		await fireEvent.press(screen.getByText("The five routes render"));
		expect(JSON.stringify(screen.toJSON())).toBe(before);
	});
});
