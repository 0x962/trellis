import { createHash } from "node:crypto";
import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { invalidInput } from "../../errors.ts";
import { git } from "./git.ts";
import { hashFile } from "./hashFile.ts";
import { safeFile } from "./safeFile.ts";

type File = { path: string; kind: "file" | "symlink" | "missing"; sha256: string | null; status: string };

export const revision = async (workspace: string) => {
	const root = await realpath(workspace);
	const head = (await git(root, ["rev-parse", "HEAD"])).trim();
	const paths = [
		...new Set(
			(await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean),
		),
	].sort();
	const status = (await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"]))
		.split("\0")
		.filter(Boolean);
	const states = new Map(status.map((entry) => [entry.slice(3), entry.slice(0, 2)]));
	const fingerprint = createHash("sha256").update(head);
	const files: File[] = [];
	for (const path of paths) {
		const entry = await (async () => {
			await safeFile(root, dirname(path));
			return lstat(join(root, path));
		})().catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
		let kind: File["kind"] = "missing";
		let sha256: string | null = null;
		if (entry?.isSymbolicLink()) {
			kind = "symlink";
			sha256 = createHash("sha256")
				.update(await readlink(join(root, path)))
				.digest("hex");
		} else if (entry !== null) {
			if (!entry.isFile())
				throw invalidInput(
					"workspace",
					`Evidence cannot fingerprint the directory ${path}. Inspect its submodule separately.`,
				);
			kind = "file";
			sha256 = await hashFile(await safeFile(root, path));
		}
		fingerprint.update(JSON.stringify([path, kind, entry === null ? 0 : entry.mode & 0o111, sha256]));
		files.push({ path, kind, sha256, status: states.get(path) ?? "  " });
	}
	return { head, fingerprint: fingerprint.digest("hex"), files };
};
