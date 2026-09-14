import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { FlowProgress } from "./FlowProgress";

test("flow progress distinguishes unknown results and human decisions", () => {
	const decisions: string[] = [];
	const view = render(
		<FlowProgress
			status="waiting"
			steps={[
				{ key: "a", title: "Build", state: "unknown", output: null, error: "Unconfirmed result" },
				{ key: "b", title: "Review", state: "waiting_human", output: "Review this output", error: null },
			]}
			onDecide={(key) => decisions.push(key)}
		/>,
	);
	expect(view.getByText("Unconfirmed result")).toBeDefined();
	expect(view.queryByRole("button", { name: "Decide Build" })).toBeNull();
	fireEvent.click(view.getByRole("button", { name: "Decide Review" }));
	expect(decisions).toEqual(["b"]);
});
