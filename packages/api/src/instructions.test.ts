import { describe, expect, test } from "bun:test";
import { instructions } from "./instructions.ts";

describe("instructions", () => {
	test("instructions(key) substitutes the key and states the never-Done rule", () => {
		const markdown = instructions("CDE");
		expect(markdown).toStartWith("## Ticket workflow (trellis)");
		expect(markdown).toContain("--project CDE");
		expect(markdown).toContain("CDE-42");
		expect(markdown.split("\n")).toContain("Never move a ticket to Done; a human does that. Never delete tickets.");
		const curl = markdown.split("\n").find((line) => line.includes("curl"));
		expect(curl).toBeDefined();
		expect(curl).toContain("x-trellis-actor:");
		expect(curl).toContain("Content-Type: application/json");
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
