import { expect, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import { LoopStatus } from "./LoopStatus";

test("a current pass stays visible when paused and only a human action runs another pass", () => {
	const actions: string[] = [];
	const data = {
		name: "Deterministic manager",
		description: "Keeps workers active.",
		paused: true,
		working: true,
		step: "Recover TRL-12",
		steps: [
			{ id: "wait", title: "Wait", description: "Wait for the next pass.", active: false, detail: "" },
			{ id: "runtime", title: "Read runtime", description: "Read agent processes.", active: false, detail: "" },
			{
				id: "workers",
				title: "Check workers and copilots",
				description: "Recover agents.",
				active: true,
				detail: "Recover TRL-12",
			},
			{ id: "messages", title: "Deliver messages", description: "Send messages.", active: true, detail: "" },
		],
		runCount: 4,
		lastStartedAt: null,
		lastFinishedAt: null,
		nextRunAt: null,
		lastError: null,
		output: [
			{ id: 1, stepId: "workers", at: "2026-09-17T03:00:00Z", message: "Resume TRL-12", level: "info" as const },
		],
		errors: [
			{
				id: 2,
				stepId: "messages",
				at: "2026-09-17T03:00:00Z",
				message: "Account quota exceeded",
				level: "error" as const,
			},
		],
	};
	const view = render(<LoopStatus {...data} busy={false} onAction={(action) => actions.push(action)} />);
	expect(view.getByText("Paused after current pass")).toBeDefined();
	expect(view.getAllByRole("article")[0]?.getAttribute("aria-label")).toBe("Wait");
	const workers = view.getByRole("article", { name: "Check workers and copilots" });
	const messages = view.getByRole("article", { name: "Deliver messages" });
	expect(workers.getAttribute("aria-current")).toBe("step");
	expect(messages.getAttribute("aria-current")).toBe("step");
	expect(within(workers).getByText("Recover TRL-12")).toBeDefined();
	expect(within(workers).queryByText("Account quota exceeded")).toBeNull();
	expect(within(messages).getByText("Account quota exceeded")).toBeDefined();
	expect(view.getByText("Account quota exceeded")).toBeDefined();
	expect(view.getByRole("button", { name: "Run now" }).hasAttribute("disabled")).toBe(true);
	view.rerender(
		<LoopStatus
			{...data}
			working={false}
			steps={data.steps.map((step) => ({ ...step, active: step.id === "wait" }))}
			busy={false}
			onAction={(action) => actions.push(action)}
		/>,
	);
	expect(view.getByRole("article", { name: "Wait" }).getAttribute("aria-current")).toBe("step");
	fireEvent.click(view.getByRole("button", { name: "Run now" }));
	fireEvent.click(view.getByRole("button", { name: "Resume loop" }));
	expect(actions).toEqual(["run", "resume"]);
});
