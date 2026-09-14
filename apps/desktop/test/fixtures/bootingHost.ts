const home = process.env.TRELLIS_HOME!;
const readyAt = Date.now() + 1000;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		if (Date.now() < readyAt) return new Response("Boot in progress", { status: 503 });
		return new Response("{}", {
			status: request.headers.get("Authorization") === "Bearer fixture-token" ? 200 : 401,
		});
	},
});
await Bun.write(`${home}/trellis.lock`, JSON.stringify({ pid: process.pid, role: "server", port: server.port }));
console.log("listening");
