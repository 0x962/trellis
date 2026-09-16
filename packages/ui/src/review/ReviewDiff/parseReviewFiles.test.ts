import { expect, test } from "bun:test";
import { parseReviewFiles } from "./parseReviewFiles";

test("review files render as plain text without syntax grammar downloads", () => {
	const files = parseReviewFiles(
		"diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n",
	);
	expect(files[0]?.lang).toBe("text");
});
