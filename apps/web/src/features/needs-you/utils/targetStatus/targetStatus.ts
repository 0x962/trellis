import type { Status, StatusCategory } from "@trellis/api";

// The status an approval, a send back, or a reopen moves a ticket to: the
// lowest-position status of `category` in the project's own set.
export const targetStatus = (statuses: Status[], category: StatusCategory): Status =>
	statuses.filter((status) => status.category === category).sort((a, b) => a.position - b.position)[0]!;
