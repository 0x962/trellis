import { resolve } from "node:path";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";
import { installationPaths } from "../installation.ts";

// The restore script exits 4 when another process holds the data home lock.
const HOME_LOCKED_EXIT = 4;

// A server that answers at the URL refuses the restore at once. The server
// restore script then takes the data home lock, which also refuses while a
// server on another port holds the home.
export default defineCommand({
	meta: { name: "restore", description: "Restore a backup archive" },
	args: { tarball: { type: "positional", required: true, description: "Backup archive" } },
	async run(context) {
		const ctx = contextOf(context);
		try {
			await ctx.deps.fetch(new Request(`${ctx.url}/api/health`), {});
		} catch {
			const paths = installationPaths(ctx.deps.env, ctx.deps.home);
			const archive = resolve(context.args.tarball);
			const result = await ctx.deps.run([process.execPath, paths.restoreEntry, paths.dataHome, archive]);
			if (result.code === HOME_LOCKED_EXIT) throw new CliFailure("HOME_LOCKED", 4, result.stderr);
			if (result.code !== 0) throw new CliFailure("RESTORE_FAILED", 1, result.stderr);
			ctx.out.write(`restored ${context.args.tarball}\nstart the server with: trellis serve\n`);
			return 0;
		}
		throw new CliFailure("SERVER_RUNNING", 4, `stop the trellis server at ${ctx.url} before restore`);
	},
});
