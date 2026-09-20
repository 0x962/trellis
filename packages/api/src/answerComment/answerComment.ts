// The comment that records the answer of a question ticket.
// `apps/server/src/services/tickets/answer.ts` writes it, and
// `apps/server/src/db/queries/answeredQuestion.ts` reads the option number
// back out of it. Both call this module, so the sentence has one owner.

// The option number comes before the reason, so a reader who scans the agent
// brief sees the choice first.
export const answerCommentBody = (option: number, reason: string) => `Answer: option ${option}. ${reason}`;

// Matches the comment above and captures the option number. The bound
// `[1-9][0-9]?` is the bound of `TicketAnswerInputSchema.option`, so a
// comment that somebody typed by hand with a wider number matches nothing
// instead of overflowing the integer the reader casts it to. The pattern is
// a POSIX regular expression, which Postgres and JavaScript both read.
export const answerOptionPattern = "^Answer: option ([1-9][0-9]?)\\.";
