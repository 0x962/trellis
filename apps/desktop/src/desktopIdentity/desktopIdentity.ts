import { mkdirSync } from "node:fs";
import { join } from "node:path";

type DesktopIdentity = {
	setName: (name: string) => void;
	getPath: (name: "appData") => string;
	setPath: (name: "userData", path: string) => void;
};

export const configureDesktopIdentity = (
	app: DesktopIdentity,
	createDirectory = (path: string) => mkdirSync(path, { recursive: true, mode: 0o700 }),
) => {
	app.setName("Trellis");
	const home = join(app.getPath("appData"), "Trellis");
	createDirectory(home);
	app.setPath("userData", home);
};
