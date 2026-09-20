import { ChangeSummary } from "../../../../review/ChangeSummary";
import { Section } from "../../Section";

// The summary an agent wrote on pull request 56930 of the canary repository.
const written = {
	headline: "Give the Operator message post a timeout.",
	why: "postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed and the close button dead. An AbortError now reads as a refusal. The screen takes the mode from the thread, not from the dialog.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

export function ChangeSummarySection() {
	return (
		<Section name="ChangeSummary" note="written, one revision behind, not written" className="items-start">
			<div className="min-w-64 flex-1">
				<ChangeSummary summary={written} behind={false} />
			</div>
			<div className="min-w-64 flex-1">
				<ChangeSummary summary={written} behind={true} />
			</div>
			<div className="min-w-64 flex-1">
				<ChangeSummary summary={null} behind={false} />
			</div>
		</Section>
	);
}
