import { expect, test } from "bun:test";
import { parseMuseModels } from "./museModels.ts";

test("the Muse catalog answer becomes the names and labels of its models", () => {
	expect(
		parseMuseModels({
			providerId: "meta",
			profileId: "tbh",
			source: "providerCatalog",
			models: [
				{ modelId: "muse-spark-1.3", displayLabel: "muse-spark-1.3", isDefault: false },
				{ modelId: "muse-spark-1.2", displayLabel: "Muse Spark 1.2", isDefault: true },
			],
		}),
	).toEqual([
		{ name: "muse-spark-1.3", label: "muse-spark-1.3" },
		{ name: "muse-spark-1.2", label: "Muse Spark 1.2" },
	]);
});

test("an answer with no models list fails the parse", () => {
	expect(() => parseMuseModels({ providerId: "meta" })).toThrow();
});
