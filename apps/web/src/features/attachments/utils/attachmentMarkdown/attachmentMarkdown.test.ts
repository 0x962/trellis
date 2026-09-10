import { describe, expect, test } from "bun:test";
import { attachmentOf } from "../../../../../test/attachments";
import { attachmentMarkdown } from "./attachmentMarkdown";

describe("attachmentMarkdown", () => {
	// OUT-45. An image pasted into a description renders as a picture, so
	// its markdown carries the image form.
	test("writes the image form for an image and the link form for another file", () => {
		const image = attachmentOf({ filename: "rename-flow.png", mime: "image/png" });
		expect(attachmentMarkdown(image)).toBe(`![rename-flow.png](${image.url})`);
		const notes = attachmentOf({ filename: "notes.md", mime: "text/markdown" });
		expect(attachmentMarkdown(notes)).toBe(`[notes.md](${notes.url})`);
	});
});
