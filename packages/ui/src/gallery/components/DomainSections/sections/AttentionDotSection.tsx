import { AttentionDot } from "../../../../primitives/AttentionDot";
import { Section } from "../../Section";

export function AttentionDotSection() {
	return (
		<Section name="AttentionDot" note="the 6 px mark: yellow when a person must act, red when a run failed or is lost">
			<span className="inline-flex items-center gap-2 text-sm text-warning">
				<AttentionDot label="The agent asks a question." />
				asks: Which cap?
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-warning">
				<AttentionDot label="The agent asks to run a tool." />
				asks to run: Bash
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-danger">
				<AttentionDot label="The run failed." tone="danger" />
				failed: Command exited 1
			</span>
			<span className="inline-flex items-center gap-2 text-sm text-danger">
				<AttentionDot label="The run is lost." tone="danger" />
				lost
			</span>
		</Section>
	);
}
