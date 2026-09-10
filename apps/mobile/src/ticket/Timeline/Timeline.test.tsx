import { describe, expect, test } from "@jest/globals";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { View } from "react-native";
import { activityItem, ago, claude, commentItem, day, hour, id, minute, navid } from "../../../test/fixtures";
import { tokens } from "../../theme/tokens";
import { Timeline } from "./Timeline";
import { timelineRows } from "./timelineRows";

// The four comments of CDE-42, newest first, as `timeline.list` answers.
const comments = [
	commentItem({
		id: id("C4"),
		actor: claude,
		body: "Typecheck and tests are green on the PR. Ready for a look.",
		createdAt: ago(2 * hour),
	}),
	commentItem({
		id: id("C3"),
		actor: navid,
		body: "Send it to review when the desktop typecheck is green.",
		createdAt: ago(20 * hour),
	}),
	commentItem({
		id: id("C2"),
		actor: claude,
		body: "Merged upstream 1.27. Every keep-marker survived; the lint fixes are in the last commit.",
		createdAt: ago(36 * hour),
	}),
	commentItem({
		id: id("C1"),
		actor: navid,
		body: "Plan: restore the five fork pages under cde/ and keep every marked site.",
		createdAt: ago(2 * day - hour),
	}),
];

describe("Timeline", () => {
	// O39. A fresh install is dark, so the cards paint the dark palette.
	test("a comment card carries the actor, the time, and the markdown body", async () => {
		await render(<Timeline rows={timelineRows(comments)} header={<View />} />);
		expect(screen.getAllByText("navid")).toHaveLength(2);
		expect(screen.getAllByText("claude")).toHaveLength(2);
		expect(screen.getAllByText(/^\d+[smhd]$/)).toHaveLength(4);
		for (const item of comments) {
			expect(screen.getByText(item.kind === "comment" ? item.body : "")).toBeOnTheScreen();
		}
	});

	// O40.
	test("an agent comment carries the agent border color", async () => {
		await render(<Timeline rows={timelineRows(comments)} header={<View />} />);
		expect(screen.getByTestId(`comment-${id("C4")}`)).toHaveStyle({ borderLeftColor: tokens.dark.agent });
		expect(screen.getByTestId(`comment-${id("C3")}`)).toHaveStyle({ borderLeftColor: tokens.dark.border });
	});

	// O41. The priority row and the parent row of CDE-42, one minute apart.
	test("an activity run by one actor renders as one collapsed line", async () => {
		const run = [
			activityItem({
				id: 2,
				actor: navid,
				field: "parent",
				fromValue: null,
				toValue: "CDE-43",
				createdAt: ago(3 * day),
			}),
			activityItem({
				id: 1,
				actor: navid,
				field: "priority",
				fromValue: "none",
				toValue: "high",
				createdAt: ago(3 * day + minute),
			}),
		];
		await render(<Timeline rows={timelineRows(run)} header={<View />} />);
		const rows = screen.getAllByTestId("activity-row");
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		expect(within(row).getByText(/priority/)).toBeOnTheScreen();
		expect(within(row).getByText(/parent/)).toBeOnTheScreen();
		expect(screen.queryAllByTestId("activity-line")).toHaveLength(0);
		await fireEvent.press(row);
		expect(screen.getAllByTestId("activity-line")).toHaveLength(2);
	});
});
