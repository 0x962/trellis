import { ChangeSummary } from "../../../../review";
import { Section } from "../../Section";

const writtenSummary = {
	headline: "Give the Operator message post a timeout.",
	why: "The message post can stall and leave the dialog with both buttons greyed. The pull request adds a timeout, treats AbortError as a refusal, and reads the screen mode from the thread.",
	watch: "ChatPage.vue. The end of the wait reads the thread, not the dialog.",
};

export function ChangeSummarySection() {
	return (
		<Section name="ChangeSummary" note="written, not written" className="items-start">
			<div className="min-w-64 flex-1">
				<ChangeSummary summary={writtenSummary} />
			</div>
			<div className="min-w-64 flex-1">
				<ChangeSummary summary={null} />
			</div>
		</Section>
	);
}
