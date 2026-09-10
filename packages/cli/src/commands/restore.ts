import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { CliFailure } from "../errors.ts";

const stampOf = (date: Date) => date.toISOString().replace(/[:.]/g, "-");

export default defineCommand({
	meta: { name: "restore", description: "Restore a backup archive" },
	args: { tarball: { type: "positional", required: true, description: "Backup archive" } },
	async run(context) {
		const ctx = contextOf(context);
		try {
			await ctx.deps.fetch(new Request(`${ctx.url}/api/health`), {});
		} catch {
			const home = resolve(ctx.deps.env.TRELLIS_HOME ?? join(homedir(), ".trellis"));
			const restore = `${home}.restore-${stampOf(ctx.deps.now())}`;
			const previous = `${home}.previous-${stampOf(ctx.deps.now())}`;
			mkdirSync(restore, { recursive: true });
			const proc = Bun.spawn(["tar", "-xzf", resolve(context.args.tarball), "-C", restore], {
				stdin: "ignore",
				stdout: "ignore",
				stderr: "inherit",
			});
			const code = await proc.exited;
			if (code !== 0) return code;
			if (existsSync(home)) renameSync(home, previous);
			renameSync(restore, home);
			if (existsSync(previous)) rmSync(previous, { recursive: true });
			ctx.out.write(`restored ${context.args.tarball}\nstart the server with: trellis serve\n`);
			return 0;
		}
		throw new CliFailure("SERVER_RUNNING", 4, `stop the trellis server at ${ctx.url} before restore`);
	},
});
