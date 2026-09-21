import { listHeading, paragraph, recommendationLine } from "./questionLines.ts";
import { type QuestionDescription, readQuestionDescription } from "./readQuestionDescription.ts";

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
