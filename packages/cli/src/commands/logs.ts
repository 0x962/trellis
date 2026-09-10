import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { usageError } from "../errors.ts";

const positiveInteger = /^[1-9][0-9]*$/;

export default defineCommand({
	meta: { name: "logs", description: "Print the server log" },
	args: {
		follow: { type: "boolean", alias: "f", description: "Continue to print new lines" },
		lines: { type: "string", alias: "n", default: "50", description: "Number of lines" },
	},
	async run(context) {
		const ctx = contextOf(context);
		if (!positiveInteger.test(context.args.lines)) throw usageError("--lines needs a positive integer");
		const home = resolve(ctx.deps.env.TRELLIS_HOME ?? join(homedir(), ".trellis"));
		const args = ["tail", "-n", context.args.lines];
		if (context.args.follow === true) args.push("-f");
		args.push(join(home, "server.log"));
		const proc = Bun.spawn(args, { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
		let stopped = false;
		const forward = (signal: NodeJS.Signals) => {
			stopped = true;
			proc.kill(signal);
		};
		const term = () => forward("SIGTERM");
		const interrupt = () => forward("SIGINT");
		process.once("SIGTERM", term);
		process.once("SIGINT", interrupt);
		const code = await proc.exited;
		process.off("SIGTERM", term);
		process.off("SIGINT", interrupt);
		return stopped ? 0 : code;
	},
});
