import { expect, test } from "bun:test";
import { refusalText, steReport, warningText } from "../../steReport.ts";

const headline =
	"Build the check, print the result, refuse bad text, help each agent, and make each review clear for today.";
const longSentence = `${Array.from({ length: 31 }, () => "word").join(", ")}.`;
const why = `${longSentence} The check — refuses this mark. The result is consumed by the CLI.`;

test("prints the four lines of the refusal transcript", () => {
	const reports = [
		steReport(headline, { headline: true }, "headline"),
		steReport(why, { headline: false }, "why"),
		steReport("nothing", { headline: false }, "watch"),
	];
	expect(`${refusalText(reports)}${warningText(reports)}`).toBe(`refused  headline is 19 words. The limit is 12.
refused  why, sentence 2, holds an em dash. Use a comma, a period or a colon.
refused  why, sentence 1, is 31 words. The limit is 25.
warn     why, sentence 3, is passive: "is consumed by". Name the actor.
`);
});

test("prints warnings without a refusal label", () => {
	expect(warningText([{ field: "watch", message: 'sentence 1 is passive: "is written". Name the actor.' }])).toBe(
		'warn     watch, sentence 1, is passive: "is written". Name the actor.\n',
	);
});
