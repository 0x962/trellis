// A question ticket opens its description with an option list and may then
// name the option its author recommends. This file reads those two parts.
// Whether a ticket asks a question at all is a separate rule, written in SQL
// in `apps/server/src/db/queries/chainRows.ts`.

// One numbered choice of a question. `number` is the number the description
// prints, and a person answers with it.
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

export type QuestionParts = {
	options: QuestionOption[];
	recommendation: QuestionRecommendation | null;
};

// A line of the option list, such as `1. Leave it missed.` or `2) Run it
// late.`. Every line of the description that matches is an option, so the
// list the page prints and the list the server accepts are the same list.
const optionLine = /^[ \t]*(\d+)[.)][ \t]+(\S.*)$/;

// The line that names the preferred option, such as
// `Recommendation: option 1. A night audit reads a different day.`
const recommendationLine = /^[ \t]*Recommendation:[ \t]*option[ \t]*(\d+)[.:)]?[ \t]*(.*)$/i;

const blank = (line: string) => line.trim() === "";

// Reads the option list and the recommendation of a question description.
export const questionParts = (description: string): QuestionParts => {
	const lines = description.split("\n");
	const options: QuestionOption[] = [];
	let recommendation: QuestionRecommendation | null = null;
	for (const [index, line] of lines.entries()) {
		const option = optionLine.exec(line);
		if (option !== null) {
			options.push({ number: Number(option[1]), text: (option[2] as string).trim() });
			continue;
		}
		const named = recommendationLine.exec(line);
		if (named === null || recommendation !== null) continue;
		// The reason runs to the end of its paragraph, so a recommendation of
		// two or three sentences keeps every sentence.
		const rest = [];
		for (const next of lines.slice(index + 1)) {
			if (blank(next)) break;
			rest.push(next.trim());
		}
		recommendation = { option: Number(named[1]), reason: [(named[2] as string).trim(), ...rest].join(" ").trim() };
	}
	return { options, recommendation };
};
