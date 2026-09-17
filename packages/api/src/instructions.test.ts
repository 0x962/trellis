import { describe, expect, test } from "bun:test";
import { instructions } from "./instructions.ts";

describe("instructions", () => {
	test("instructions(key) substitutes the key and states the deletion rule", () => {
		const markdown = instructions("CDE");
		expect(markdown).toStartWith("## Ticket workflow (trellis)");
		expect(markdown).toContain("--project CDE");
		expect(markdown).toContain("CDE-42");
		expect(markdown.split("\n")).toContain("Never delete tickets.");
		const curl = markdown.split("\n").find((line) => line.includes("curl"));
		expect(curl).toBeDefined();
		expect(curl).toContain("x-trellis-actor:");
		expect(curl).toContain("Content-Type: application/json");
	});

	test("instructions(key) reserves the human surfaces for human communication", () => {
		const markdown = instructions("CDE");
		const lines = markdown.split("\n");
		expect(lines).toContain("Use #ai for technical coordination.");
		expect(lines).toContain("Use ticket comments and non-AI chat channels only for useful human communication.");
		expect(lines).toContain(
			"Do not post routine state updates, action logs, acknowledgements, or agent coordination there.",
		);
		expect(lines).toContain("Do not repeat an unchanged blocker.");
		expect(lines).toContain("When you own a human request, answer in the same human-facing surface.");
		expect(lines).toContain(
			"The project manager owns an unmentioned human post. A worker replies only after an exact run mention or a manager handoff.",
		);
	});

	test("instructions(key) leaves no placeholder behind", () => {
		const cde = instructions("CDE");
		const trl = instructions("TRL");
		expect(cde).not.toBe(trl);
		expect(trl.replaceAll("TRL", "CDE")).toBe(cde);
		expect(cde.replaceAll("CDE", "TRL")).toBe(trl);
		for (const placeholder of ["{key}", "<key>", "<KEY>", "$KEY", "KEY-42"]) {
			expect(cde, placeholder).not.toContain(placeholder);
			expect(trl, placeholder).not.toContain(placeholder);
		}
	});
});
