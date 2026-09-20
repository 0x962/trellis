import { describe, expect, test } from "bun:test";
import { steCheck } from "./steCheck";

describe("steCheck refusals", () => {
	test("reports the transcript headline limit", () => {
		const text =
			"Build a clear and reliable summary checker for every pull request description that agents write before review begins today.";
		expect(steCheck(text, { headline: true }).refusals).toContain("headline is 19 words. The limit is 12.");
	});

	test("reports the transcript em dash rule", () => {
		expect(steCheck("Keep this short. The check — refuses this mark.", { headline: false }).refusals).toContain(
			"sentence 2 holds an em dash. Use a comma, a period or a colon.",
		);
	});

	test("reports the transcript sentence limit", () => {
		const text = `${Array.from({ length: 31 }, () => "word").join(" ")}.`;
		expect(steCheck(text, { headline: false }).refusals).toContain("sentence 1 is 31 words. The limit is 25.");
	});

	test("reports a headline without a verb", () => {
		expect(steCheck("The summary check.", { headline: true }).refusals).toContain(
			"headline does not start with a verb.",
		);
	});

	test("reports a noun cluster", () => {
		expect(steCheck("The pull request summary contract changes.", { headline: false }).refusals).toContain(
			'sentence 1 holds a noun cluster of 4 words: "pull request summary contract". The limit is 3.',
		);
	});

	test("orders the transcript refusals by rule", () => {
		const long = `${Array.from({ length: 31 }, () => "word").join(" ")}.`;
		const result = steCheck(`${long} The check — refuses this mark.`, { headline: false });
		expect(result.refusals.slice(0, 2)).toEqual([
			"sentence 2 holds an em dash. Use a comma, a period or a colon.",
			"sentence 1 is 31 words. The limit is 25.",
		]);
	});
});

describe("steCheck warnings", () => {
	test("reports the transcript passive form", () => {
		expect(
			steCheck("The CLI reads it. The server sends it. The result is consumed by the CLI.", { headline: false })
				.warnings,
		).toContain('sentence 3 is passive: "is consumed by". Name the actor.');
	});

	test("keeps the sentence number after a quoted string", () => {
		expect(
			steCheck('The error says "stop." The result is consumed by the CLI.', { headline: false }).warnings,
		).toContain('sentence 2 is passive: "is consumed by". Name the actor.');
	});

	test("reports a gerund used as a noun", () => {
		expect(steCheck("Testing is the purpose.", { headline: false }).warnings).toContain(
			'sentence 1 uses "Testing" as a noun. Use an infinitive.',
		);
	});
});

test("the worked summary passes", () => {
	const headline = "Give the Operator message post a timeout.";
	const why =
		"postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed and the close button dead. An AbortError now reads as a refusal. The screen takes the mode from the thread, not from the dialog.";
	const watch = "ChatPage.vue. The end of the wait reads the thread, not the dialog.";
	expect(steCheck(headline, { headline: true })).toEqual({ refusals: [], warnings: [] });
	expect(steCheck(why, { headline: false })).toEqual({ refusals: [], warnings: [] });
	expect(steCheck(watch, { headline: false })).toEqual({ refusals: [], warnings: [] });
});

test("quoted material does not produce a report", () => {
	const text =
		'`one — two` "three — four"\nError: five — six\ncheck: seven — eight\ntest: nine — ten\npackages/pull/request/summary/contract.ts';
	expect(steCheck(text, { headline: false })).toEqual({ refusals: [], warnings: [] });
});
