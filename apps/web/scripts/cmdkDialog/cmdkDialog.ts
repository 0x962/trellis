import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export function cmdkDialog(): Plugin {
	return {
		name: "cmdk-dialog",
		enforce: "pre",
		resolveId(source, importer) {
			if (source === "@radix-ui/react-dialog" && importer?.includes("/cmdk/")) {
				return fileURLToPath(new URL("../../src/lib/emptyRadixDialog.ts", import.meta.url));
			}
		},
	};
}
