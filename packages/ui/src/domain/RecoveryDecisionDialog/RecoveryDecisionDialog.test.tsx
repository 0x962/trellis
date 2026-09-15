import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { RecoveryDecisionDialog } from "./RecoveryDecisionDialog";

test("cancel requires a reason and preserves unknown receipt in its explanation", () => {
	let reason = "";
	const view = render(
		<RecoveryDecisionDialog
			kind="delivery"
			details="Delivery d1 · generation 3"
			processing={false}
			onCancel={() => {}}
			onConfirm={(value) => {
				reason = value;
			}}
		/>,
	);
	expect(view.getByText(/The receipt remains unknown/)).toBeDefined();
	const button = view.getByRole("button", { name: "Cancel delivery" }) as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.change(view.getByRole("textbox", { name: "Reason" }), { target: { value: "Use a new local manager." } });
	fireEvent.click(button);
	expect(reason).toBe("Use a new local manager.");
});
test("retirement requires confirmation that the external process stopped", () => {
	const view = render(
		<RecoveryDecisionDialog
			kind="assignment"
			details="Run r1 · terminal t1"
			processing={false}
			onCancel={() => {}}
			onConfirm={() => {}}
		/>,
	);
	const button = view.getByRole("button", { name: "Retire assignment" }) as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	expect(view.getByText("Run r1 · terminal t1")).toBeDefined();
	fireEvent.click(view.getByRole("checkbox", { name: "I confirm that this external process has stopped" }));
	expect(button.disabled).toBe(false);
});
