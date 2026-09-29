import type { FlowRunTreeProps } from "@trellis/ui";

export const runExpansionByDiff = new Map<string, Map<string, boolean>>();
export const runTreeStates = new Map<string, NonNullable<FlowRunTreeProps["state"]>>();
export const lastFocusedRun: { id: string | null } = { id: null };
