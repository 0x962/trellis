// The line patterns that `readQuestionDescription` and `questionParts` share.
// The folder index does not export this file.

// The line that opens the option list.
export const listHeading = /^[ \t]*Options:[ \t]*/;

// A numbered option, such as `1. Leave it missed.` or `2) Run it late.`.
export const optionLine = /^[ \t]*(\d+)[.)][ \t]+(\S.*)$/;

// The line that names the preferred option, such as
// `Recommendation: option 1. A night audit reads a different day.`
export const recommendationLine = /^[ \t]*Recommendation:[ \t]*option[ \t]*(\d+)[.:)]?[ \t]*(.*)$/i;

const blank = (line: string) => line.trim() === "";

// The paragraph that starts at `line` and stops at the first blank line.
export const paragraph = (lines: string[], from: number) => {
	const end = lines.slice(from).findIndex(blank);
	return lines.slice(from, end === -1 ? lines.length : from + end);
};

export const optionBlock = (lines: string[]) => {
	for (const [heading, line] of lines.entries()) {
		if (!listHeading.test(line)) continue;
		const inline = line.replace(listHeading, "");
		if (optionLine.test(inline)) {
			const block = paragraph(lines, heading);
			return { heading, end: heading + block.length, lines: [inline, ...block.slice(1)] };
		}
		const offset = lines.slice(heading + 1).findIndex((next) => !blank(next));
		if (offset === -1) continue;
		const from = heading + 1 + offset;
		if (!optionLine.test(lines[from] as string)) continue;
		const block = paragraph(lines, from);
		return { heading, end: from + block.length, lines: block };
	}
	return null;
};
