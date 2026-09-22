import { expect, mock, test } from "bun:test";
import { copyBrowserLink } from "./copyBrowserLink";

test("copies the current browser link and shows the confirmation", async () => {
	const writeText = mock(async () => {});
	const notify = mock(() => {});
	const fail = mock(() => {});

	await copyBrowserLink("https://github.com/0x962/trellis/pull/1/files", { writeText, notify, fail });

	expect(writeText).toHaveBeenCalledWith("https://github.com/0x962/trellis/pull/1/files");
	expect(notify).toHaveBeenCalledWith("Link copied");
	expect(fail).not.toHaveBeenCalled();
});

test("shows an error and no confirmation when the clipboard refuses the link", async () => {
	const writeText = mock(async () => {
		throw new Error("Write permission denied.");
	});
	const notify = mock(() => {});
	const fail = mock(() => {});

	await copyBrowserLink("https://github.com/0x962/trellis/pull/1/files", { writeText, notify, fail });

	expect(fail).toHaveBeenCalledWith("The link was not copied.");
	expect(notify).not.toHaveBeenCalled();
});
