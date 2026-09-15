import { dialog } from "electron";
import { changeHome } from "../changeHome/changeHome.ts";
import { handoffFailure } from "../changeHome/handoffFailure.ts";
import type { HostConnection } from "../host/host.ts";
import { inspectExistingHome } from "../inspectExistingHome/inspectExistingHome.ts";
import { writeSelectedHome } from "../selectedHome/selectedHome.ts";
import { serviceCommand } from "../service/service.ts";
import {
	inspectStandaloneCandidate,
	type StandaloneCandidate,
} from "../standaloneHandoff/inspectStandaloneCandidate.ts";
import { handoffStandalone, type StandaloneHandoffResult } from "../standaloneHandoff/standaloneHandoff.ts";
import { stopCurrentService } from "../stopCurrentService/stopCurrentService.ts";

let active = false;

export const chooseDataHome = async (options: {
	current: string;
	userData: string;
	host?: HostConnection;
	helper: string;
	resources: string;
	relaunch: () => void;
}): Promise<void> => {
	if (active) return;
	active = true;
	let candidate: StandaloneCandidate;
	let prepared: StandaloneHandoffResult | undefined;
	try {
		await changeHome(options.current, {
			choose: async () => {
				const result = await dialog.showOpenDialog({
					title: "Choose a Trellis data directory",
					message:
						"Choose the folder that contains db and trellis.lock. Press Command-Shift-G to enter a hidden folder such as ~/.trellis.",
					defaultPath: options.current,
					properties: ["openDirectory", "showHiddenFiles"],
				});
				return result.canceled ? null : result.filePaths[0]!;
			},
			inspect: inspectExistingHome,
			confirm: async (home) => {
				candidate = await inspectStandaloneCandidate(home.home);
				const { response } = await dialog.showMessageBox({
					type: "warning",
					message: "Use this Trellis data directory?",
					detail: [
						`Current directory: ${options.current}`,
						`Selected directory: ${candidate.home}`,
						`Backup: ${candidate.backupPath}`,
						...(candidate.service ? ["Trellis disables the standalone service before it opens this database."] : []),
						"Trellis uses this directory in place. Both directories keep their files.",
						"Automatic work starts paused. External sessions keep their records and processes. Review them before you enable automation.",
						"External agents need the desktop access token to update tickets.",
						"Any local work in the current directory stops. Trellis then restarts with the selected data.",
					].join("\n\n"),
					buttons: ["Cancel", "Use this directory"],
					defaultId: 0,
					cancelId: 0,
				});
				return response === 1;
			},
			prepare: async () => {
				prepared = await handoffStandalone(candidate, options.resources);
			},
			stopCurrent: () =>
				stopCurrentService({
					home: options.current,
					host: options.host,
					helper: options.helper,
					userData: options.userData,
				}),
			persist: (home) => writeSelectedHome(options.userData, home),
			start: async () => {
				await serviceCommand(options.helper, "register");
			},
			startFailed: async (error) => {
				await dialog.showMessageBox({
					type: "error",
					message: "Directory saved, but the background service did not start",
					detail: `Selected directory: ${candidate.home}\n\n${(error as Error).message}\n\nTrellis will reopen so you can check the service or choose another directory.`,
					buttons: ["Reopen Trellis"],
				});
			},
			relaunch: options.relaunch,
		});
	} catch (error) {
		dialog.showErrorBox("The data directory switch needs attention", handoffFailure(error, prepared));
	} finally {
		active = false;
	}
};
