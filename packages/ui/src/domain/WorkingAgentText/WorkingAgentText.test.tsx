import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkingAgentText, workingAgentsLabel } from "./WorkingAgentText";

test("draws working words with the shared film colours", () => {
	const html = renderToStaticMarkup(<WorkingAgentText tooltip={false}>Sessions</WorkingAgentText>);

	expect(html).toContain("text-film");
	expect(html).toContain("Sessions");
});

test("names one or many working agents", () => {
	expect(workingAgentsLabel(1)).toBe("1 agent working");
	expect(workingAgentsLabel(2)).toBe("2 agents working");
});
