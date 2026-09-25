import { expect, test } from "bun:test";
import type { PageSummary } from "@trellis/api";
import type { RowDeps } from "../../rows";
import { pageResultRows } from "./resultRows";

test("opens a Page result at its stable project path", () => {
	const actions: string[] = [];
	const deps = {
		close: () => {
			actions.push("close");
		},
		action: {
			navigate: (path: string) => {
				actions.push(path);
			},
		},
	} as unknown as RowDeps;
	const [row] = pageResultRows(
		[
			{
				ref: "TRL/pages/forecast",
				projectKey: "TRL",
				title: "Forecast",
				summary: "Quarterly forecast",
			} as PageSummary,
		],
		deps,
	);

	expect(row).toMatchObject({ value: "page:TRL/pages/forecast", label: "Forecast", prefix: "TRL" });
	row!.run();
	expect(actions).toEqual(["close", "/p/TRL/pages/forecast"]);
});
