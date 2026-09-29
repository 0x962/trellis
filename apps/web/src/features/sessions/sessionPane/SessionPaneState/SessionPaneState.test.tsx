import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { sessionPane } from "../sessionPane";
import { SessionPaneState } from "./SessionPaneState";

const run = {
	id: "01M37KDXE1YZY0ASKS5K7H683K",
	name: "Fix the error pages",
	runtime: "native",
	kind: "session",
	state: "failed",
	processStatus: null,
	terminalId: null,
	error: "The prior attempt failed.",
} as AgentRun;

describe("SessionPaneState", () => {
	test("shows startup while a first launch waits for a terminal", () => {
		const pane = sessionPane(run, false, true);
		expect(pane.kind).toBe("starting");
		if (pane.kind === "terminal" || pane.kind === "archived") throw new Error("The pane did not show startup.");

		const html = renderToStaticMarkup(<SessionPaneState pane={pane} />);
		expect(html).toContain("The agent is starting");
		expect(html).toContain("Trellis waits for the new attempt to run or fail.");
		expect(html).not.toContain("This session has no process");
		expect(html).not.toContain("Trellis starts no process for this runtime.");
	});
});
