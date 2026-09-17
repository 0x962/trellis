import { join } from "node:path";
import type { MessageBoxOptions } from "electron";

// `phase` is the numbered step of the progress window, such as "Prepare app".
// `stage` is the finer line inside that step, such as "Check installed app".
export type StartupStep = { phase: string; stage: string };

export type StartupFailure = {
	error: Error;
	// The progress window reports no step when it fails before its first report.
	step?: StartupStep;
	// The selected data directory, when the app has already read it.
	home?: string;
};

const stepLabel = (step: StartupStep) => (step.stage === step.phase ? step.stage : `${step.phase}: ${step.stage}`);

const detail = ({ error, step, home }: StartupFailure) => {
	const parts: string[] = [];
	if (step) parts.push(`${stepLabel(step)} did not finish.`);
	parts.push(error.message);
	if (home) parts.push(`Read ${join(home, "desktop-host.log")} for the host output.`);
	return parts.join("\n\n");
};

export const showStartupError = async (
	dialogs: { message: (options: MessageBoxOptions) => Promise<unknown>; quit: () => void },
	failure: StartupFailure,
) => {
	await dialogs.message({
		type: "error",
		message: "Trellis cannot start",
		detail: detail(failure),
		buttons: ["Quit"],
		defaultId: 0,
		cancelId: 0,
	});
	dialogs.quit();
};
