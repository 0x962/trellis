import { expect, test } from "bun:test";
import { isReviewDraft } from "./reviewDraft.ts";

test("reads a pull request as a draft when GitHub or Trellis says draft", () => {
	expect(isReviewDraft({ isDraft: false, localState: "draft" })).toBe(true);
	expect(isReviewDraft({ isDraft: true, localState: "ready" })).toBe(true);
	expect(isReviewDraft({ isDraft: true, localState: "draft" })).toBe(true);
});

test("reads a pull request as ready only when both say ready", () => {
	expect(isReviewDraft({ isDraft: false, localState: "ready" })).toBe(false);
});
