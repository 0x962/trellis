import { expect, test } from "bun:test";
import { agentGuide } from "@trellis/api/agent-guide";
import { planGuideText } from "./planGuide.ts";

test("the epic guide uses the common delegation guidance", () => {
	const text = planGuideText(agentGuide());
	expect(text).toStartWith("## Use sub-agents");
	expect(text).toContain("trellis ticket create");
	expect(text).not.toContain("## Talk to other agents");
});
