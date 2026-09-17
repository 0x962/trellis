import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { LoopStatus } from "./LoopStatus";

test("a current pass stays visible when paused and only a human action runs another pass", () => {
	const actions: string[] = [];
	const data = {
		name: "Deterministic manager",
		description: "Keeps workers active.",
		paused: true,
		working: true,
		step: "Recover TRL-12",
		runCount: 4,
		lastStartedAt: null,
		lastFinishedAt: null,
		nextRunAt: null,
		lastError: null,
		output: [{ id: 1, at: "2026-09-17T03:00:00Z", message: "Resume TRL-12", level: "info" as const }],
		errors: [{ id: 2, at: "2026-09-17T03:00:00Z", message: "Account quota exceeded", level: "error" as const }],
	};
	const view = render(<LoopStatus {...data} busy={false} onAction={(action) => actions.push(action)} />);
	expect(view.getByText("Paused after current pass")).toBeDefined();
	expect(view.getByText("Recover TRL-12")).toBeDefined();
	expect(view.getByText("Account quota exceeded")).toBeDefined();
	expect(view.getByRole("button", { name: "Run now" }).hasAttribute("disabled")).toBe(true);
	view.rerender(<LoopStatus {...data} working={false} busy={false} onAction={(action) => actions.push(action)} />);
	fireEvent.click(view.getByRole("button", { name: "Run now" }));
	fireEvent.click(view.getByRole("button", { name: "Resume loop" }));
	expect(actions).toEqual(["run", "resume"]);
});
