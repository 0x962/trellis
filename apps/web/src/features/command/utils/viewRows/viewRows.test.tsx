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

test("all tab commands dispatch after the palette closes and detach cleanly", async () => {
	const { onPageTabCommand } = await import("../../pageTabCommands");
	const calls: string[] = [];
	const off = onPageTabCommand((command) => calls.push(command));
	const rows = viewRows({ action: {}, close: () => calls.push("palette closed") } as unknown as RowDeps);
	for (const command of ["new", "close", "reopen", "next", "previous"]) {
		rows.find((row) => row.value === `view.${command}Tab`)!.run();
	}
	expect(calls).toEqual(
		["new", "close", "reopen", "next", "previous"].flatMap((command) => ["palette closed", command]),
	);
	off();
	rows.find((row) => row.value === "view.newTab")!.run();
	expect(calls.at(-1)).toBe("palette closed");
});
