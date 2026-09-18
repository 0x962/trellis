import { ArrowsSplit, type Icon, Repeat, Robot, SquaresFour, UserCheck } from "@phosphor-icons/react";
import type { FlowRunKind } from "./types";

// The mark of each step kind, on the flow canvas and in a run.
export const flowKindIcons: Record<FlowRunKind, Icon> = {
	agent: Robot,
	gate: ArrowsSplit,
	human: UserCheck,
	group: SquaresFour,
	loop: Repeat,
};
