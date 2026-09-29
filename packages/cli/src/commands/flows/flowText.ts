import { type FlowSummary, flowPurpose } from "@trellis/api";
import { type FlowRun, runProgress } from "../flow/runProgress/runProgress.ts";

export const flowRunCommand = (slug: string, number: number): string => `trellis flow start ${slug} --diff ${number}`;

// One indented line per flow: the slug, what the flow is for, and the
// command that starts it on this pull request. An agent picks by the second
// column, so a flow with no description prints its name there instead.
export const flowChoiceLines = (flows: FlowSummary[], number: number): string[] => {
	const slugWidth = Math.max(...flows.map((flow) => flow.slug.length));
	const purposeWidth = Math.max(...flows.map((flow) => flowPurpose(flow).length));
	return flows.map(
		(flow) =>
			`    ${flow.slug.padEnd(slugWidth)}  ${flowPurpose(flow).padEnd(purposeWidth)}  ${flowRunCommand(flow.slug, number)}`,
	);
};

export const flowRunText = (run: FlowRun, number: number): string => {
	const progress = runProgress(run);
	const flow = progress.name;
	if (progress.status === "succeeded")
		return (
			`The ${flow} flow succeeded on #${number}. This one run answers for the whole diff.\n` +
			"Fix every finding it left. Do not run the flow again after you fix them.\n"
		);
	if (progress.status === "canceled") return `The ${flow} flow was canceled on #${number}.\n`;
	if (progress.status === "failed") {
		const step = progress.failedStep;
		const where = step === undefined ? "" : ` at the step ${step.title}`;
		const why = step?.error ?? progress.error;
		return `The ${flow} flow failed on #${number}${where}.${why === null || why === undefined ? "" : ` ${why}`}\n`;
	}
	if (progress.human) {
		const step = progress.humanStep;
		const where = step === undefined ? "" : ` at the step ${step.title}`;
		return `The ${flow} flow waits for a person on #${number}${where}. Open the Flows tab of the diff to answer it.\n`;
	}
	if (progress.status === "waiting")
		return `The ${flow} flow waits on #${number} (${progress.detail}). Read its state with: trellis flow run show ${run.id}\n`;
	return `The ${flow} flow still runs on #${number}. Read its state with: trellis flow run list --diff ${number}\n`;
};
