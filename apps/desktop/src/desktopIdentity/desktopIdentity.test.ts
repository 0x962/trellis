import { expect, test } from "bun:test";
import { configureDesktopIdentity } from "./desktopIdentity.ts";

test("desktop identity creates and sets its fixed data path", () => {
	const calls: string[] = [];
	configureDesktopIdentity(
		{
			setName: (name) => calls.push(`name:${name}`),
			getPath: (name) => {
				expect(name).toBe("appData");
				return "/tmp/Application Support";
			},
			setPath: (name, path) => calls.push(`${name}:${path}`),
		},
		(path) => {
			calls.push(`directory:${path}`);
			return undefined;
		},
	);
	expect(calls).toEqual([
		"name:Trellis",
		"directory:/tmp/Application Support/Trellis",
		"userData:/tmp/Application Support/Trellis",
	]);
});
