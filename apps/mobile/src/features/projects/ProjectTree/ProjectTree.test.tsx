import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { projectSummary } from "../../../../test/projects";
import { layout } from "../../../theme/layout";
import { tokens } from "../../../theme/tokens";
import { ProjectTree } from "./ProjectTree";

// The seeded tree: two roots, two sub-projects of CDE, and two more roots.
const seeded = [
	projectSummary({ path: "CDE", name: "Superset CDE", position: 0, openCount: 31 }),
	projectSummary({ path: "CDE.web", position: 0, openCount: 12 }),
	projectSummary({ path: "CDE.host", position: 1, openCount: 7 }),
	projectSummary({ path: "TRL", name: "trellis", position: 1, openCount: 14 }),
	projectSummary({ path: "MRG", name: "margin", position: 2, openCount: 3 }),
];

const row = (path: string) => screen.getByTestId(`project-row-${path}`);

const style = (path: string) => StyleSheet.flatten(row(path).props.style) as { height?: number; paddingLeft?: number };

// One indent level. A sub-project sits one step right of its parent.
const indentStep = tokens.space[4];

describe("ProjectTree", () => {
	test("a root row shows the key badge and a sub-project row shows the name only", async () => {
		await render(<ProjectTree projects={seeded} onSelect={() => {}} />);

		const root = within(row("CDE"));
		expect(root.getByText("CDE")).toBeOnTheScreen();
		expect(root.getByText("Superset CDE")).toBeOnTheScreen();

		const child = within(row("CDE.web"));
		expect(child.getByText("web")).toBeOnTheScreen();
		expect(child.queryByText("CDE")).toBeNull();
	});

	test("each level indents by one step from the tokens", async () => {
		const deep = [
			projectSummary({ path: "CDE", name: "Superset CDE", position: 0 }),
			projectSummary({ path: "CDE.web", position: 0 }),
			projectSummary({ path: "CDE.web.auth", position: 0 }),
		];
		await render(<ProjectTree projects={deep} onSelect={() => {}} />);

		expect(style("CDE").paddingLeft).toBe(0);
		expect(style("CDE.web").paddingLeft).toBe(indentStep);
		expect(style("CDE.web.auth").paddingLeft).toBe(2 * indentStep);
	});

	test("every tree row keeps the same fixed height and truncates a long name", async () => {
		const long = "a sub-project whose name runs far past the width of a phone screen and then some more";
		await render(
			<ProjectTree
				projects={[
					projectSummary({ path: "CDE", name: "Superset CDE" }),
					projectSummary({ path: "CDE.web", name: long }),
				]}
				onSelect={() => {}}
			/>,
		);

		expect(style("CDE").height).toBe(layout.treeRow);
		expect(style("CDE.web").height).toBe(layout.treeRow);
		expect(screen.getByText(long).props.numberOfLines).toBe(1);
	});

	test("a row shows the open count in tabular numerals", async () => {
		await render(<ProjectTree projects={seeded} onSelect={() => {}} />);
		const count = within(row("CDE")).getByText("31");
		expect(StyleSheet.flatten(count.props.style)).toMatchObject({ fontVariant: ["tabular-nums"] });
	});

	test("a press hands the pressed project path to onSelect", async () => {
		const onSelect = jest.fn();
		await render(<ProjectTree projects={seeded} onSelect={onSelect} />);
		fireEvent.press(row("CDE.web"));
		expect(onSelect).toHaveBeenCalledWith("CDE.web");
	});
});
