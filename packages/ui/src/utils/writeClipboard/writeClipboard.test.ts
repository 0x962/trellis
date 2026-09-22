import { expect, mock, test } from "bun:test";
import { writeClipboard } from "./writeClipboard";

test("writes through the desktop bridge in the macOS app", async () => {
	const desktop = mock(async () => {});
	const web = mock(async () => {});
	const target = { trellisDesktop: { writeClipboard: desktop }, navigator: { clipboard: { writeText: web } } };

	await writeClipboard("https://github.com/0x962/trellis/pull/2", target as never);

	expect(desktop).toHaveBeenCalledWith("https://github.com/0x962/trellis/pull/2");
	expect(web).not.toHaveBeenCalled();
});

test("writes through the web clipboard in the browser build", async () => {
	const web = mock(async () => {});
	const target = { navigator: { clipboard: { writeText: web } } };

	await writeClipboard("TRL-358", target as never);

	expect(web).toHaveBeenCalledWith("TRL-358");
});
