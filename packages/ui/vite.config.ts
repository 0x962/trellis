import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The gallery: a Vite app under ./gallery that renders every primitive.
// The port is fixed so a bookmark and the design reviewer's CDP script
// always find it; a taken port fails instead of drifting to another.
export default defineConfig({
	root: fileURLToPath(new URL("./gallery", import.meta.url)),
	plugins: [react(), tailwindcss()],
	server: { port: 5180, strictPort: true },
	build: { outDir: "dist", emptyOutDir: true },
});
