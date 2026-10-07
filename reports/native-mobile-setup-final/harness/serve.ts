const root = process.env.TRL1420_WEB_ROOT!;
const port = Number(process.env.TRL1420_PORT ?? "4173");

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	async fetch(request) {
		const url = new URL(request.url);
		const leaf = url.pathname.split("/").at(-1)!;
		const route = url.pathname === "/" || !leaf.includes(".");
		let file = Bun.file(root + (route ? "/index.html" : url.pathname));
		if (!(await file.exists())) file = Bun.file(root + "/index.html");
		return new Response(file, {
			headers: {
				"Cross-Origin-Opener-Policy": "same-origin",
				"Cross-Origin-Embedder-Policy": "require-corp",
			},
		});
	},
});

console.log(server.url.href);
await new Promise(() => {});
