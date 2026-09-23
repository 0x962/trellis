import { expect, test } from "bun:test";
import { patchDigest } from "./patchDigest";

const patch = `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,1 +1,1 @@
-const limit = 10;
+const limit = 20;
`;

test("the same patch text gives the same value", () => {
	expect(patchDigest(patch)).toBe(patchDigest(patch));
});

// A rewrite of one line for another line keeps the added line count and the
// deleted line count, so only the text can tell the two revisions apart.
test("a rewrite of one line for another line gives a different value", () => {
	const rewritten = patch.replace("+const limit = 20;", "+const limit = 30;");

	expect(patchDigest(rewritten)).not.toBe(patchDigest(patch));
});

test("a change of one character gives a different value", () => {
	expect(patchDigest(`${patch} `)).not.toBe(patchDigest(patch));
});

test("an empty patch gives a value", () => {
	expect(patchDigest("")).toMatch(/^[0-9a-f]+$/);
});
