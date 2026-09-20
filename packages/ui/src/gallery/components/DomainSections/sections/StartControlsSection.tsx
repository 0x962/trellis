import { useState } from "react";
import { ProviderIcon } from "../../../../domain/ProviderIcon";
import { StartControls, type StartDependency } from "../../../../domain/StartControls";
import { PickerButton } from "../../../../primitives/PickerButton";
import { Select } from "../../../../primitives/Select";
import { Section } from "../../Section";

// These words come from screens 5 and 6 of section 2 in
// docs/research/trellis-for-one-human-and-many-agents.md. OP-32 is a ticket
// with a pull request that nobody merged. OP-52 is a question that nobody
// answered.
const op32: StartDependency = {
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	reason: "is not merged",
};

const op52: StartDependency = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	reason: "is open",
};

// The ticket page passes the harness picker, the model picker and the
// effort picker. The gallery holds no harness catalog and no model catalog,
// so these three controls carry fixed words. The middle one is a
// `PickerButton`, the control that `ModelPicker` in the web app draws.
function Pickers() {
	const [harness, setHarness] = useState("claude");
	const [effort, setEffort] = useState("high");
	return (
		<>
			<Select
				label="Harness"
				value={harness}
				onValueChange={setHarness}
				items={[
					{ value: "claude", label: "Claude Code" },
					{ value: "codex", label: "Codex" },
				]}
			/>
			{/* `PickerButton` fills the width of its parent, so this box holds it
			    to the width of its words, as `LaunchFields` does in the web app. */}
			<div className="min-w-0">
				<PickerButton label="Model" size="sm">
					<span className="inline-flex min-w-0 items-center gap-2">
						<ProviderIcon provider="anthropic" decorative className="size-3.5" />
						<span className="truncate">Claude Opus 5</span>
					</span>
				</PickerButton>
			</div>
			<Select
				label="Effort"
				value={effort}
				onValueChange={setEffort}
				items={[
					{ value: "high", label: "high" },
					{ value: "medium", label: "medium" },
				]}
			/>
		</>
	);
}

export function StartControlsSection() {
	return (
		<Section
			name="StartControls"
			note="two tickets hold the work back, one ticket, nothing, a run that starts, and a start that failed"
		>
			<div className="w-full max-w-160">
				<StartControls
					pickers={<Pickers />}
					dependencies={[op32, op52]}
					starting={false}
					error={null}
					onStart={() => {}}
				/>
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} dependencies={[op32]} starting={false} error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} dependencies={[]} starting={false} error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} dependencies={[op32]} starting error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls
					pickers={<Pickers />}
					dependencies={[]}
					starting={false}
					error="The workspace of the ticket is gone."
					onStart={() => {}}
				/>
			</div>
		</Section>
	);
}
