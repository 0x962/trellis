import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { cmdkDialog } from "../scripts/cmdkDialog";

export default defineConfig({
	plugins: [tailwindcss(), cmdkDialog()],
	optimizeDeps: { exclude: ["@tldraw/assets", "cmdk"] },
	server: { host: "127.0.0.1", strictPort: true },
});
