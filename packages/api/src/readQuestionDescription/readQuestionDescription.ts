import type { Reviewer } from "../schemas/enums.ts";

// One numbered choice of a question. `number` is the number the description
// prints, and a person answers with it. The numbers need not run 1, 2, 3: a
// description that numbers its options 1, 2 and 5 gives those three numbers.
export type QuestionOption = {
	number: number;
	text: string;
};

// The option the author of the question prefers, and the sentences that say
// why. The words `Recommendation: option 1.` stay out of `reason`.
export type QuestionRecommendation = {
	option: number;
	reason: string;
};

export type QuestionDescription = {
	options: QuestionOption[];
	recommendation: QuestionRecommendation | null;
};

// The line that opens the option list.
const listHeading = /^[ \t]*Options:[ \t]*/;

// A line of the option list, such as `1. Leave it missed.` or `2) Run it
// late.`.
const optionLine = /^[ \t]*(\d+)[.)][ \t]+(\S.*)$/;

// The line that names the preferred option, such as
// `Recommendation: option 1. A night audit reads a different day.`
const recommendationLine = /^[ \t]*Recommendation:[ \t]*option[ \t]*(\d+)[.:)]?[ \t]*(.*)$/i;

const blank = (line: string) => line.trim() === "";

const toOption = (line: string): QuestionOption | null => {
	const found = optionLine.exec(line);
	return found === null ? null : { number: Number(found[1]), text: (found[2] as string).trim() };
};

// The paragraph that starts at `line` and stops at the first blank line.
const paragraph = (lines: string[], from: number) => {
	const end = lines.slice(from).findIndex(blank);
	return lines.slice(from, end === -1 ? lines.length : from + end);
};

const readRecommendation = (lines: string[]): QuestionRecommendation | null => {
	for (const [index, line] of lines.entries()) {
		const found = recommendationLine.exec(line);
		if (found === null) continue;
		const rest = paragraph(lines, index + 1).map((next) => next.trim());
		return { option: Number(found[1]), reason: [(found[2] as string).trim(), ...rest].join(" ").trim() };
	}
	return null;
};

export const readQuestionDescription = (description: string): QuestionDescription => {
	const lines = description.split("\n");
	const heading = lines.findIndex((line) => listHeading.test(line));
	if (heading === -1) return { options: [], recommendation: null };
	// The list runs from the `Options:` line to the first blank line. A
	// numbered line below that blank line belongs to some other paragraph,
	// such as the reasons under the recommendation, and is not an option.
	const block = paragraph(lines, heading);
	const first = toOption((block[0] as string).replace(listHeading, ""));
	const options = [...(first === null ? [] : [first]), ...block.slice(1).map(toOption)].filter(
		(option) => option !== null,
	);
	return { options, recommendation: readRecommendation(lines.slice(heading + block.length)) };
};

// The ask of a question, and the parts `QuestionBlock` prints. The ask is the
// description without the option list and without the recommendation
// paragraph, so the ticket page prints each option and the reason once. A
// description with no option list is all ask.
export type QuestionParts = QuestionDescription & { ask: string };

export const questionParts = (description: string): QuestionParts => {
	const lines = description.split("\n");
	const heading = lines.findIndex((line) => listHeading.test(line));
	if (heading === -1) return { ask: description, options: [], recommendation: null };
	const after = lines.slice(heading + paragraph(lines, heading).length);
	const found = after.findIndex((line) => recommendationLine.test(line));
	const reasonLength = found === -1 ? 0 : 1 + paragraph(after, found + 1).length;
	const rest = found === -1 ? after : [...after.slice(0, found), ...after.slice(found + reasonLength)];
	return { ask: [...lines.slice(0, heading), ...rest].join("\n").trim(), ...readQuestionDescription(description) };
};

// A ticket asks a question when a person must review it and its description
// opens with an option list. `questionDescription` in
// `apps/server/src/db/queries/support.ts` runs the same rule in SQL for the
// `isQuestion` field of a ticket summary, and the two must agree.
export const asksQuestion = (reviewer: Reviewer | null, description: string) =>
	reviewer === "human" && /^Options:\s*\S/.test(description);
