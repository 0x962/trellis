import type { AgentRunKind } from "@trellis/api";

type MarkKind = "agent" | "manager";

export const agentKindOf = (kind: AgentRunKind): MarkKind => (kind === "manager" ? "manager" : "agent");
