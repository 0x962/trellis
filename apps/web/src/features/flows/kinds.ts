import type { FlowNodeKind } from "@trellis/api";
import { Bot, type LucideIcon, Repeat, Split, Timer, UserCheck } from "lucide-react";

export type FlowKindMeta = { label: string; description: string; icon: LucideIcon };

export const flowKinds: Record<FlowNodeKind, FlowKindMeta> = {
	agent: { label: "Agent", description: "Runs one agent and passes its result on.", icon: Bot },
	gate: { label: "Gate", description: "Asks a yes or no question and takes one branch.", icon: Split },
	human: { label: "Human", description: "Waits until a person approves or rejects.", icon: UserCheck },
	budget: { label: "Budget", description: "Gives the steps inside it a time limit.", icon: Timer },
	loop: {
		label: "Loop",
		description: "Runs the steps inside it again until the exit question answers done.",
		icon: Repeat,
	},
};

// The order of the kinds in the palette.
export const flowKindOrder: readonly FlowNodeKind[] = ["agent", "gate", "human", "budget", "loop"];
