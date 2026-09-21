import { checkText, type EvidenceCheckResult } from "../evidence/checkText.ts";

// The text above the floor list of `trellis ready <pr>` and of a refused
// `trellis pr add`. Each MISSING line carries the one command that fills it.
export const pullRequestReadyText = (result: EvidenceCheckResult): string => {
	const { number } = result.pullRequest;
	const lead = result.complete
		? `#${number} is ready for review. It has the summary and every evidence floor item.`
		: [
				`#${number} is not ready for review. A pull request requires the summary and every evidence floor item.`,
				`Run the command beside each MISSING line, then run: trellis ready ${number}`,
			].join("\n");
	return `${lead}\n\n${checkText(result)}`;
};
