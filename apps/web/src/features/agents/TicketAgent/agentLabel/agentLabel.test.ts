import { expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { agentLabel } from "./agentLabel";

const run = (harness: string | null, name = "Agent") => ({
	name,
	harness: harness === null ? null : HarnessSchema.parse(JSON.parse(harness)),
});

test("a recorded model prints its family", () => {
	expect(agentLabel(run('{"preset":"codex","model":"openai/gpt-5.6-sol"}'))).toBe("Sol");
	expect(agentLabel(run('{"preset":"claude","model":"anthropic/claude-opus-5"}'))).toBe("Opus");
});

test("a run with no recorded model prints its harness", () => {
	expect(agentLabel(run('{"preset":"claude"}'))).toBe("Claude");
	expect(agentLabel(run('{"preset":"muse"}'))).toBe("Muse");
});

test("a custom harness and a run with no harness print the name of the run", () => {
	expect(
		agentLabel(
			run('{"preset":"custom","startCommand":"a {{prompt}}","resumeCommand":"a {{resumeText}}"}', "crisp-fjord"),
		),
	).toBe("crisp-fjord");
	expect(agentLabel(run(null, "crisp-fjord"))).toBe("crisp-fjord");
});
