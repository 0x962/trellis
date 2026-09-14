import { join, resolve } from "node:path";

export const desktopPaths = (appPath: string, resources: string, packaged: boolean) => ({
	preload: join(appPath, "dist/preload.cjs"),
	hostRoot: packaged ? join(resources, "host") : resolve(appPath, "../.."),
	helper: join(resources, "../MacOS/TrellisHost"),
});
