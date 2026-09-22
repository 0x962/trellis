import { expect, mock, test } from "bun:test";
import { copyBrowserLink } from "./copyBrowserLink";

test("copies the current browser link and shows the confirmation", async () => {
	const writeText = mock(async () => {});
	const notify = mock(() => {});

	await copyBrowserLink("https://github.com/0x962/trellis/pull/1/files", { writeText, notify });

	expect(writeText).toHaveBeenCalledWith("https://github.com/0x962/trellis/pull/1/files");
	expect(notify).toHaveBeenCalledWith("Link copied");
});
