import type { AgentRunKind, PersonaKind } from "@trellis/api";

// The persona kind an avatar draws for a run. A session agent has no
// persona, so it takes the builder look.
export const personaKindOf = (kind: AgentRunKind): PersonaKind => (kind === "session" ? "builder" : kind);
