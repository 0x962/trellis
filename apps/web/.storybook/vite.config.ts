import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss()],
	resolve: {
		alias: {
			"@radix-ui/react-dialog": fileURLToPath(new URL("../src/lib/emptyRadixDialog.ts", import.meta.url)),
		},
	},
	server: { host: "127.0.0.1", strictPort: true },
});
