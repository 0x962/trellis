import type { AgentRunKind } from "@trellis/api";

export const agentKindOf = (_kind: AgentRunKind) => "agent" as const;
