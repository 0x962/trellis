import { listHeading, paragraph, recommendationLine } from "./questionLines.ts";

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

// A line of the option list, such as `1. Leave it missed.` or `2) Run it
// late.`.
const optionLine = /^[ \t]*(\d+)[.)][ \t]+(\S.*)$/;

const toOption = (line: string): QuestionOption | null => {
	const found = optionLine.exec(line);
	return found === null ? null : { number: Number(found[1]), text: (found[2] as string).trim() };
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
