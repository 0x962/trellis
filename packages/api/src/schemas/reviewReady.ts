import { z } from "zod";
import { REVIEW_GAP_KINDS } from "../reviewReady/reviewReady.ts";
import { CountSchema } from "./primitives.ts";

// One part a pull request still needs before the person reviews it.
// `reviewGaps` in `packages/api/src/reviewReady` builds the list, and every
// row that carries a pull request carries it.
export const ReviewGapSchema = z.object({
	kind: z.enum(REVIEW_GAP_KINDS),
	count: CountSchema,
});
