import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import type { MessageBoxOptions } from "electron";

export type HomeDialogs = {
	message: (options: MessageBoxOptions) => Promise<{ response: number }>;
	useExisting: () => Promise<void>;
};

export const prepareHome = async (
	{ home }: { home: string },
	{ message, useExisting }: HomeDialogs,
): Promise<boolean> => {
	if (existsSync(home) && (await readdir(home)).length > 0) return true;
	const choice = await message({
		message: "Choose Trellis data",
		detail: `Use an existing Trellis data directory or create new data.\n\nNew data: ${home}`,
		buttons: ["New Trellis data", "Use existing directory", "Cancel"],
		defaultId: 0,
		cancelId: 2,
	});
	if (choice.response === 0) return true;
	if (choice.response === 1) await useExisting();
	return false;
};
