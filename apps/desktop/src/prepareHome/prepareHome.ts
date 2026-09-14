import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { MessageBoxOptions } from "electron";
import { rollbackCommand, runHomeMaintenance } from "../homeImportClient/homeImportClient.ts";

export type HomeImportDialogs = {
	message: (options: MessageBoxOptions) => Promise<{ response: number }>;
	chooseSource: () => Promise<string | null>;
	maintenance?: typeof runHomeMaintenance;
};

export const prepareHome = async (
	{ home, resources }: { home: string; resources: string },
	{ message, chooseSource, maintenance = runHomeMaintenance }: HomeImportDialogs,
): Promise<boolean> => {
	const recovery = () =>
		`The imported target stays at ${home}. Archive it before another import:\n\n${rollbackCommand(resources, home)}`;
	if (existsSync(join(home, "import-in-progress.json"))) {
		await message({
			type: "error",
			message: "A previous import needs attention",
			detail: recovery(),
			buttons: ["Close"],
		});
		return false;
	}
	if (existsSync(home) && (await readdir(home)).length > 0) return true;
	const choice = await message({
		message: "Choose Trellis data",
		detail: `Create new data, or copy data from a stopped Trellis host.\n\nTarget: ${home}`,
		buttons: ["New Trellis data", "Import existing Trellis data", "Cancel"],
		defaultId: 0,
		cancelId: 2,
	});
	if (choice.response === 0) return true;
	if (choice.response !== 1) return false;
	const source = await chooseSource();
	if (source === null) return false;
	try {
		const preview = await maintenance(resources, { operation: "preview", source, target: home });
		const counts = preview.counts;
		const detail = [
			`Source: ${preview.source}`,
			`Target: ${preview.target}`,
			`Projects: ${counts.projects}, tickets: ${counts.tickets}, agents: ${counts.agents}`,
			`Attachments: ${counts.attachments}, artifacts: ${counts.artifacts}, checks: ${counts.checks}`,
			`${preview.files} files, ${preview.bytes.toLocaleString()} bytes`,
			"Local work starts paused. Every project starts paused and its repository needs trust.",
			...(preview.workspaceReferences.length
				? [
						"Workspace paths still point to their original folders. The import keeps a copy of the files in the new home.",
					]
				: []),
			...preview.blockers,
		].join("\n\n");
		const blocked = preview.blockers.length > 0;
		const confirmation = await message({
			type: blocked ? "warning" : "info",
			message: blocked ? "Stop existing work before import" : "Import this Trellis data?",
			detail,
			buttons: blocked ? ["Cancel"] : ["Cancel", "Import data"],
			defaultId: 0,
			cancelId: 0,
		});
		if (blocked || confirmation.response !== 1) return false;
		await maintenance(resources, { operation: "import", source, target: home, expectedVersion: preview.version });
		await message({
			message: "Trellis data is ready",
			detail: "Local work stays paused. Review each project and trust its repository before you resume local work.",
			buttons: ["Open Trellis"],
		});
		return true;
	} catch (error) {
		const retained =
			existsSync(join(home, "import-in-progress.json")) || existsSync(join(home, "import-provenance.json"));
		await message({
			type: "error",
			message: "Trellis data import failed",
			detail: `${(error as Error).message}${retained ? `\n\n${recovery()}` : ""}`,
			buttons: ["Close"],
		});
		return false;
	}
};
