import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";

// A data home holds `db/`, `attachments/`, `attachments/tmp/`, and
// `backups/`. Every test gets its own home under TRELLIS_HOME, so two tests
// never write the same blob path.

export const freshHome = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "home-"));

// A home whose attachment directories exist, as the boot sweep leaves them.
export const freshHomeWithDirs = () => {
	const home = freshHome();
	mkdirSync(join(home, "attachments", "tmp"), { recursive: true });
	return home;
};

export const tempFilePath = (home: string, name: string) => join(home, "attachments", "tmp", name);

export const sha256Of = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

// Writes one upload temp file and returns its name.
export const writeTempFile = async (home: string, name: string, bytes: Uint8Array) => {
	mkdirSync(join(home, "attachments", "tmp"), { recursive: true });
	await Bun.write(tempFilePath(home, name), bytes);
	return name;
};
