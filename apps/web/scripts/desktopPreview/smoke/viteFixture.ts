import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { previewConfig } from "../previewConfig/previewConfig.ts";

const [directory, root, hostOrigin, port] = process.argv.slice(2) as [string, string, string, string];
let staticCredentials = 0;
const server = await createServer(
	previewConfig(
		{
			root: directory,
			plugins: [
				react(),
				{
					name: "credential-check",
					configureServer(vite) {
						vite.middlewares.use((request, _response, next) => {
							if (!/^\/(api|rpc)(\/|$)/.test(request.url!) && request.headers.authorization) staticCredentials++;
							next();
						});
					},
				},
			],
			resolve: {
				alias: { "react-dom": join(root, "node_modules/react-dom"), react: join(root, "node_modules/react") },
			},
			server: { fs: { allow: [directory, root] } },
		},
		hostOrigin,
		Number(port),
	),
);
await server.listen();
process.send!({ ready: true });
process.on("message", async () => {
	await server.close();
	process.send!({ closed: true, staticCredentials });
	process.disconnect();
});
