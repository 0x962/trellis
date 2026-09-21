import { optionBlock, paragraph, recommendationLine } from "./questionLines.ts";
import { type QuestionDescription, readQuestionDescription } from "./readQuestionDescription.ts";

// The ask of a question, and the parts `QuestionBlock` prints. The ask is the
// description without the option list and without the recommendation
// paragraph, so the ticket page prints each option and the reason once. A
// description with no option list is all ask.
export type QuestionParts = QuestionDescription & { ask: string };

const trimBlankLines = (lines: string[]) => {
	const first = lines.findIndex((line) => line.trim() !== "");
	if (first === -1) return [];
	const last = lines.findLastIndex((line) => line.trim() !== "");
	return lines.slice(first, last + 1);
};

export const questionParts = (description: string): QuestionParts => {
	const lines = description.split("\n");
	const block = optionBlock(lines);
	if (block === null) return { ask: description, options: [], recommendation: null };
	const after = lines.slice(block.end);
	const found = after.findIndex((line) => recommendationLine.test(line));
	const reasonLength = found === -1 ? 0 : 1 + paragraph(after, found + 1).length;
	const before = trimBlankLines(lines.slice(0, block.heading));
	const rest = trimBlankLines(found === -1 ? after : [...after.slice(0, found), ...after.slice(found + reasonLength)]);
	const separator = before.length > 0 && rest.length > 0 ? [""] : [];
	return { ask: [...before, ...separator, ...rest].join("\n"), ...readQuestionDescription(description) };
};
