import { z } from "zod";
import { PackageRecipeSchema } from "../../../packageRecipe";

const DigestFileSchema = PackageRecipeSchema.shape.components.shape.catalog;
const CatalogSourceSchema = z.object({
	root: z.enum(["trellis", "engine"]),
	path: DigestFileSchema.shape.path,
	sha256: DigestFileSchema.shape.sha256,
});

export const CatalogManifestSchema = z.object({
	schemaVersion: z.literal(1),
	engine: z.object({ commit: PackageRecipeSchema.shape.source.shape.commit }),
	allowedForPublication: z.boolean(),
	definitions: z
		.array(
			z.object({
				id: z.string().min(1),
				source: CatalogSourceSchema,
				sourceDependencies: z.array(CatalogSourceSchema),
			}),
		)
		.min(1),
	runtimeSources: z.array(CatalogSourceSchema),
	edgeHandles: z.object({ engineSource: CatalogSourceSchema, frontendSource: CatalogSourceSchema }),
});
