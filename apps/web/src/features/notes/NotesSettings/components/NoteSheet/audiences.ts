import type { NoteAudience } from "@trellis/api";

export const noteAudiences = [
	{ value: "all", label: "All agents", description: "Every agent of the project and its sub-projects reads it." },
	{ value: "worker", label: "Workers", description: "Ticket and flow agents read it." },
] satisfies Array<{ value: NoteAudience; label: string; description: string }>;
