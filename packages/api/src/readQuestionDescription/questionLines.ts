// The line patterns that `readQuestionDescription` and `questionParts` share.
// The folder index does not export this file.

// The line that opens the option list.
export const listHeading = /^[ \t]*Options:[ \t]*/;

// The line that names the preferred option, such as
// `Recommendation: option 1. A night audit reads a different day.`
export const recommendationLine = /^[ \t]*Recommendation:[ \t]*option[ \t]*(\d+)[.:)]?[ \t]*(.*)$/i;

const blank = (line: string) => line.trim() === "";

// The paragraph that starts at `line` and stops at the first blank line.
export const paragraph = (lines: string[], from: number) => {
	const end = lines.slice(from).findIndex(blank);
	return lines.slice(from, end === -1 ? lines.length : from + end);
};
