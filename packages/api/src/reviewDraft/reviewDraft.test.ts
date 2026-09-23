import { expect, test } from "bun:test";
import { isReviewDraft } from "./reviewDraft.ts";

test("reads a pull request as a draft from the Trellis state", () => {
	expect(isReviewDraft({ localState: "draft" })).toBe(true);
});

test("reads a pull request as ready when Trellis says ready", () => {
	expect(isReviewDraft({ localState: "ready" })).toBe(false);
});
