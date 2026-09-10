import { defineCommand } from "citty";
import { contextOf } from "../context.ts";
import { json } from "../output.ts";

const width = "git config user.name".length;

export default defineCommand({
	meta: { name: "whoami", description: "Explain the actor resolution" },
	async run(context) {
		const ctx = contextOf(context);
		const resolution = ctx.actor();
		switch (ctx.format.mode) {
			case "quiet":
				ctx.out.write(`${resolution.actor}\n`);
				return;
			case "json":
			case "jsonl":
				ctx.out.write(json(resolution));
				return;
			case "table": {
				const steps = resolution.steps.map(
					(step) => `${step.step.padEnd(width)}  ${step.value ?? "unset"}${step.applied ? "  (applied)" : ""}`,
				);
				const tail = [
					`${"actor".padEnd(width)}  ${resolution.actor}`,
					`${"session".padEnd(width)}  ${resolution.session ?? "-"}`,
				];
				ctx.out.write(`${[...steps, ...tail].join("\n")}\n`);
				return;
			}
		}
	},
});
