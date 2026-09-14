import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { AgentConversation } from "./AgentConversation";

test("a process without harness events is unknown, not working", () => {
	const view = render(<AgentConversation state="unknown" transcript={[]} result={null} error={null} />);
	expect(view.getByRole("status").textContent).toContain("Agent state unknown");
	expect(view.queryByText("Working")).toBeNull();
});

test("permission state retains the transcript without announcing every message", () => {
	const view = render(
		<AgentConversation
			state="needs_input"
			transcript={[{ role: "assistant", text: "I need to read the source." }]}
			result={null}
			error={null}
		/>,
	);
	expect(view.getByRole("status").textContent).toContain("Needs your input");
	expect(view.getByLabelText("Agent transcript").textContent).toContain("I need to read the source.");
	expect(view.getByLabelText("Agent transcript").hasAttribute("aria-live")).toBe(false);
});
