import { resolve, sep } from "node:path";

const directory = resolve(process.env.STORYBOOK_DIRECTORY ?? resolve(import.meta.dir, "../../storybook-static"));
if (!(await Bun.file(resolve(directory, "index.html")).exists())) {
	throw new Error("Build Storybook before starting its static server.");
}
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: Number(process.env.STORYBOOK_PORT ?? 6006),
	fetch: async (request) => {
		const pathname = new URL(request.url).pathname;
		const path = resolve(directory, `.${decodeURIComponent(pathname === "/" ? "/index.html" : pathname)}`);
		if (!path.startsWith(`${directory}${sep}`)) return new Response("Invalid path", { status: 400 });
		const file = Bun.file(path);
		return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
	},
});
console.log(`Storybook: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => {
		server.stop(true);
		process.exit();
	});
}
