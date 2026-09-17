import { z } from "zod";

const response = await fetch("https://ai-gateway.vercel.sh/v1/models");
if (!response.ok) throw new Error(`Model catalog request failed: ${response.status}`);
const catalog = z
	.object({
		data: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				type: z.string(),
				tags: z.array(z.string()).optional(),
			}),
		),
	})
	.parse(await response.json());
const providers = new Set(["google", "anthropic", "meta", "openai"]);
const models = catalog.data
	.filter(
		(model) => providers.has(model.id.split("/")[0]!) && model.type === "language" && model.tags?.includes("tool-use"),
	)
	.map(({ id, name }) => ({ id, name }))
	.sort((a, b) => a.id.localeCompare(b.id));
await Bun.write(
	new URL("../packages/api/src/models/catalog.json", import.meta.url),
	`${JSON.stringify(models, null, "\t")}\n`,
);
console.log(`Updated ${models.length} models from Vercel AI Gateway.`);
