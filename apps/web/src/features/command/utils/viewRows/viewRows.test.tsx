import { expect, test } from "bun:test";
import type { RowDeps } from "../../rows";
import { viewRows } from "./viewRows";

test("renders tab history actions and runs them after the palette closes", () => {
	const calls: string[] = [];
	const deps = {
		action: {
			back: () => calls.push("back"),
			forward: () => calls.push("forward"),
		},
		close: () => calls.push("close"),
		pathname: "/needs-you",
		search: {},
	} as unknown as RowDeps;
	const rows = viewRows(deps);

	expect(rows.find((row) => row.value === "view.back")?.label).toBe("Back in this tab");
	expect(rows.find((row) => row.value === "view.forward")?.label).toBe("Forward in this tab");
	rows.find((row) => row.value === "view.back")!.run();
	rows.find((row) => row.value === "view.forward")!.run();
	expect(calls).toEqual(["close", "back", "close", "forward"]);
});
