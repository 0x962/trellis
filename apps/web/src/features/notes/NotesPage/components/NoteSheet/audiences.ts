import type { NoteAudience } from "@trellis/api";

export const noteAudiences = [
	{ value: "all", label: "All agents", description: "Every agent of the project and its sub-projects reads it." },
	{ value: "manager", label: "Copilot", description: "The copilot reads it. Builders and reviewers do not." },
	{ value: "worker", label: "Workers", description: "Builders and reviewers read it. The manager does not." },
] satisfies Array<{ value: NoteAudience; label: string; description: string }>;
