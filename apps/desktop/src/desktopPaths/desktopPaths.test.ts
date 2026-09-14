import { expect, test } from "bun:test";
import { desktopPaths } from "./desktopPaths.ts";

test("packaged preload and helper paths belong to the installed bundle", () => {
	expect(
		desktopPaths(
			"/Applications/Trellis.app/Contents/Resources/app.asar",
			"/Applications/Trellis.app/Contents/Resources",
			true,
		),
	).toEqual({
		preload: "/Applications/Trellis.app/Contents/Resources/app.asar/dist/preload.cjs",
		hostRoot: "/Applications/Trellis.app/Contents/Resources/host",
		helper: "/Applications/Trellis.app/Contents/MacOS/TrellisHost",
	});
});
