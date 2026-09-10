import { describe, expect, test } from "bun:test";
import { attachment, id } from "../../../test/fixtures";
import { attachmentUrl, attachmentView } from "./attachmentView";

describe("attachment view", () => {
	// O10. 3 MB is 3145728 bytes; the second image is over it.
	test("an image under 3 MB shows inline and every other file opens externally", () => {
		const small = attachment({
			id: id("A1"),
			filename: "settings-pages.png",
			mime: "image/png",
			size: 184_320,
		});
		const large = attachment({ id: id("A2"), filename: "full-screen.png", mime: "image/png", size: 4_000_000 });
		const notes = attachment({ id: id("A3"), filename: "notes.md", mime: "text/markdown", size: 2_048 });
		expect(attachmentView(small)).toBe("inline");
		expect(attachmentView(large)).toBe("external");
		expect(attachmentView(notes)).toBe("external");
	});

	// O11.
	test("the file url is the server url and the attachment path", () => {
		const file = attachment({ id: id("A1"), url: `/api/attachments/${id("A1")}/file` });
		expect(attachmentUrl("http://h:4521", file)).toBe(`http://h:4521/api/attachments/${id("A1")}/file`);
	});
});
