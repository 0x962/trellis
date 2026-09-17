import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function assertInstalledAncestry(repo: string, commit: string, application: string) {
	if (!existsSync(application)) return;
	const metadata = JSON.parse(await readFile(join(application, "Contents/Resources/host/build.json"), "utf8"));
	if (typeof metadata.commit !== "string" || !/^[a-f0-9]{40}$/.test(metadata.commit)) {
		throw new Error(
			`The installed app at ${application} has no valid source commit. Recover its build metadata before installation.`,
		);
	}
	const child = Bun.spawn(["/usr/bin/git", "merge-base", "--is-ancestor", metadata.commit, commit], {
		cwd: repo,
		stdin: "ignore",
		stdout: "ignore",
		stderr: "pipe",
	});
	const stderr = await new Response(child.stderr).text();
	if ((await child.exited) !== 0) {
		throw new Error(
			`Candidate ${commit} does not include installed commit ${metadata.commit} from ${application}. Integrate the installed source into this checkout, commit the result, and run the production install again.${stderr.trim() ? ` Git: ${stderr.trim()}` : ""}`,
		);
	}
}
