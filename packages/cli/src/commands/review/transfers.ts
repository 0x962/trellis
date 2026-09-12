import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { MarginFileSchema } from "@trellis/api/client";
import { defineCommand } from "citty";
import { clientOf } from "../../client";
import { contextOf } from "../../context";
import { usageError } from "../../errors";
import { json } from "../../output";
import { marginExport } from "./marginExport";
export const transfers = {
	"import-margin": defineCommand({
		args: {
			from: { type: "string", description: "Margin comments directory" },
			apply: { type: "boolean", description: "Write the import; the default is a preview" },
		},
		async run(c) {
			const ctx = contextOf(c);
			const source = resolve(c.args.from ?? `${ctx.deps.env.MARGIN_HOME ?? `${homedir()}/.margin`}/comments`);
			const names = (await readdir(source)).filter((name) => name.endsWith(".json")).sort();
			const files = await Promise.all(
				names.map(async (name) => MarginFileSchema.parse(await Bun.file(resolve(source, name)).json())),
			);
			ctx.out.write(json(await clientOf(ctx).reviews.importMargin({ source, dryRun: !c.args.apply, files })));
		},
	}),
	export: defineCommand({
		args: { pr: { type: "positional", required: true }, format: { type: "string", default: "trellis" } },
		async run(c) {
			const ctx = contextOf(c);
			if (!["trellis", "margin"].includes(c.args.format)) throw usageError("Use --format trellis or --format margin.");
			const result = await clientOf(ctx).reviews.export({ pr: c.args.pr });
			ctx.out.write(json(c.args.format === "margin" ? marginExport(result) : result));
		},
	}),
};
