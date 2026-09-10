import type { Status, StatusCategory } from "@trellis/api";

// The status an approval, a send back, or a reopen moves a ticket to: the
// lowest-position status of `category` in the project's own set.
export const targetStatus = (_statuses: Status[], _category: StatusCategory): Status => {
	throw new Error("targetStatus is not implemented.");
};
