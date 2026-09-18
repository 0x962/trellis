import type { Icon } from "@phosphor-icons/react";
import type { FlowNodeKind } from "@trellis/api";
import { flowKindIcons } from "@trellis/ui";

export type FlowKindMeta = { label: string; description: string; icon: Icon };

export const flowKinds: Record<FlowNodeKind, FlowKindMeta> = {
	agent: { label: "Agent", description: "Runs one agent and passes its result on.", icon: flowKindIcons.agent },
	gate: { label: "Gate", description: "Asks a yes or no question and takes one branch.", icon: flowKindIcons.gate },
	human: { label: "Human", description: "Waits until a person approves or rejects.", icon: flowKindIcons.human },
	group: {
		label: "Group",
		description: "Runs child steps together or along their connections, with an optional time limit.",
		icon: flowKindIcons.group,
	},
	loop: {
		label: "Loop",
		description: "Runs the steps inside it again until the exit question answers done.",
		icon: flowKindIcons.loop,
	},
};

// The order of the kinds in the palette.
export const flowKindOrder: readonly FlowNodeKind[] = ["agent", "gate", "human", "group", "loop"];
