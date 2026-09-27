import { expect, test } from "bun:test";
import { agentGuide } from "@trellis/api/agent-guide";
import { planGuideText } from "./planGuide.ts";

test("the epic guide includes ticket rules and delegation guidance", () => {
	const text = planGuideText(agentGuide());
	expect(text).toStartWith("## Write tickets and plan waves");
	expect(text).toContain("## Use sub-agents");
	expect(text).toContain("trellis ticket create");
	expect(text).not.toContain("## Talk to other agents");
});
