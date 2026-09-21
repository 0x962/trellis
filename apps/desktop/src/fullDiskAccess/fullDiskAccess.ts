import { existsSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { MessageBoxOptions } from "electron";

export const fullDiskAccessPane = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

// Agents run git, claude, codex, gh and find under the Trellis app. When one of
// them reads a folder that macOS protects, macOS asks the person in the Trellis
// name, one folder at a time. Full Disk Access covers all of these folders
// with one grant.
const detail = `Agents run tools such as git, claude, codex and find for Trellis. When a tool reads a protected folder, macOS asks you again for each folder:

- Desktop, Documents and Downloads
- Network volumes and removable volumes
- Data of other apps
- The Photos and Music libraries

Turn on Trellis in Privacy & Security > Full Disk Access to allow all of them once. If Trellis is already on, turn it off and on again. Folders under ~/projects and ~/.trellis need no grant.

macOS can ask you to reopen Trellis after the change.`;

// macOS protects this file with Full Disk Access and never shows a prompt for
// it, so a read tells whether Trellis has the grant without asking the person.
export const hasFullDiskAccess = async (home: string) => {
	try {
		const file = await open(join(home, "Library/Application Support/com.apple.TCC/TCC.db"), "r");
		await file.close();
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
		throw error;
	}
};

export const askForFullDiskAccess = async (input: {
	granted: () => Promise<boolean>;
	// The file exists after the person checks "Do not ask again".
	declinedFile: string;
	message: (options: MessageBoxOptions) => Promise<{ response: number; checkboxChecked: boolean }>;
	openSettings: (url: string) => Promise<void>;
}) => {
	if (existsSync(input.declinedFile) || (await input.granted())) return;
	const answer = await input.message({
		type: "info",
		message: "Allow Trellis to read your folders",
		detail,
		buttons: ["Open System Settings", "Not Now"],
		defaultId: 0,
		cancelId: 1,
		checkboxLabel: "Do not ask again",
	});
	if (answer.checkboxChecked) writeFileSync(input.declinedFile, "");
	if (answer.response === 0) await input.openSettings(fullDiskAccessPane);
};
