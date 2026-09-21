import type { Reviewer } from "../schemas/enums.ts";

// A ticket asks a question when a person must review it and its description
// opens with an option list. `questionDescription` in
// `apps/server/src/db/queries/support.ts` runs the same rule in SQL for the
// `isQuestion` field of a ticket summary, and the two must agree.
export const asksQuestion = (reviewer: Reviewer | null, description: string) =>
	reviewer === "human" && /^Options:\s*\S/.test(description);
