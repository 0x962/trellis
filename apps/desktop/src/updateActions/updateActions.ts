import { dialog } from "electron";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";
import { readUpdateStatus } from "../updateStatus/updateStatus.ts";

export const showUpdateStatus = async (home: string, release: PinnedRelease) => {
	const status = await readUpdateStatus(home, release);
	await dialog.showMessageBox({
		type: status.state === "blocked" ? "warning" : "info",
		message:
			status.state === "blocked"
				? "Package update is blocked"
				: status.state === "current"
					? "Package is current"
					: "Host restart required",
		detail: `${status.detail}\n\nPackage: ${release.manifest.version}\nRelease: ${release.manifest.id.slice(0, 12)}\nRuntime protocol: ${release.manifest.protocol}`,
		buttons: ["Done"],
	});
};
