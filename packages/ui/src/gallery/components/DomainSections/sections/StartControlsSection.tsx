import { useState } from "react";
import { type StartBlocker, StartControls } from "../../../../domain/StartControls";
import { Select } from "../../../../primitives/Select";
import { Section } from "../../Section";

// Screens 5 and 6 of section 2 in
// docs/research/trellis-for-one-human-and-many-agents.md hold these words.
// OP-34 waits on one pull request. OP-33 waits on that pull request and on
// a question that nobody answered.
const op32: StartBlocker = {
	identifier: "OP-32",
	title: "Service: A routine run opens a chat and queues the turn",
	words: "is not merged",
};

const op52: StartBlocker = {
	identifier: "OP-52",
	title: "Decision: a missed window, run it late or leave it missed",
	words: "is open",
};

// The ticket page passes the harness picker, the model picker and the
// effort picker. The gallery holds no harness catalog, so these three
// `Select` triggers stand in for them and carry the same words.
function Pickers() {
	const [harness, setHarness] = useState("claude");
	const [model, setModel] = useState("opus");
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
			<Select
				label="Model"
				value={model}
				onValueChange={setModel}
				items={[
					{ value: "opus", label: "Opus" },
					{ value: "sonnet", label: "Sonnet" },
				]}
			/>
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
			className="flex-col items-stretch"
		>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} blockers={[op32, op52]} starting={false} error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} blockers={[op32]} starting={false} error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} blockers={[]} starting={false} error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls pickers={<Pickers />} blockers={[op32]} starting error={null} onStart={() => {}} />
			</div>
			<div className="w-full max-w-160">
				<StartControls
					pickers={<Pickers />}
					blockers={[]}
					starting={false}
					error="The workspace of the ticket is gone."
					onStart={() => {}}
				/>
			</div>
		</Section>
	);
}
