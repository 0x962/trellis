import { expect, mock, test } from "bun:test";
import { commentInteractions } from "./commentInteractions";

type Options = ReturnType<typeof commentInteractions>;
type Context = Parameters<NonNullable<Options["onLineSelectionEnd"]>>[1];
const context = {
	type: "diff",
	item: { type: "diff", id: "src/current.ts", fileDiff: { name: "src/current.ts", prevName: "src/previous.ts" } },
} as Context;

test.each(["additions", "deletions"] as const)("a click on %s opens a comment at that line", (annotationSide) => {
	const select = mock(() => {});
	const options = commentInteractions(select);
	options.onLineClick?.(
		{
			type: "diff-line",
			annotationSide,
			lineNumber: 12,
			numberColumn: false,
			lineType: "change-addition",
			lineElement: document.createElement("div"),
			numberElement: document.createElement("div"),
			event: new PointerEvent("click"),
		},
		context,
	);
	expect(select).toHaveBeenCalledWith({
		path: "src/current.ts",
		side: annotationSide === "deletions" ? "old" : "new",
		startLine: 12,
		line: 12,
	});
});

test.each(["additions", "deletions"] as const)(
	"a completed %s range opens one comment with ordered endpoints",
	(side) => {
		const select = mock(() => {});
		const options = commentInteractions(select);
		options.onLineSelectionEnd?.({ start: 15, end: 10, side }, context);
		expect(select).toHaveBeenCalledTimes(1);
		expect(select).toHaveBeenCalledWith({
			path: "src/current.ts",
			side: side === "deletions" ? "old" : "new",
			startLine: 10,
			line: 15,
		});
	},
);

test("a line-number selection opens its single-line comment", () => {
	const select = mock(() => {});
	commentInteractions(select).onLineSelectionEnd?.({ start: 3, end: 3, side: "additions" }, context);
	expect(select).toHaveBeenCalledWith({ path: "src/current.ts", side: "new", startLine: 3, line: 3 });
});

test("a cancelled selection does not open a comment", () => {
	const select = mock(() => {});
	commentInteractions(select).onLineSelectionEnd?.(null, context);
	expect(select).not.toHaveBeenCalled();
});

test("a range across both diff sides cannot create one invalid anchor", () => {
	const select = mock(() => {});
	commentInteractions(select).onLineSelectionEnd?.(
		{ start: 2, end: 5, side: "deletions", endSide: "additions" },
		context,
	);
	expect(select).not.toHaveBeenCalled();
});
