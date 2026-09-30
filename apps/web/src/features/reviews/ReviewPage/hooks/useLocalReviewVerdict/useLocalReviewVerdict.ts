import { type ReviewSubmission, verdictMark } from "@trellis/api";
import { useMemo } from "react";

export const useLocalReviewVerdict = (submissions: ReviewSubmission[] | undefined) =>
	useMemo(() => (submissions === undefined ? undefined : verdictMark(submissions)), [submissions]);
