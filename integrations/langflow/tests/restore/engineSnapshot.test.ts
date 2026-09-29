import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exportEngineSnapshot } from "../../../../apps/server/src/services/langflowBackup/engineSnapshot";
import { fixture } from "./fixture/fixture";

for (const mode of ["complete", "wrong-binding", "corrupt-database", "redirect"] as const) {
	test(`engine snapshot client: ${mode}`, async () => {
		const setup = await fixture();
		const database = Buffer.from("streamed database bytes");
		const secret = Buffer.from("test-secret");
		const digest = (bytes: Buffer) => ({
			sha256: createHash("sha256").update(bytes).digest("hex"),
			size: bytes.length,
		});
		const metadata = {
			...setup.metadata,
			compatibility: {
				...setup.metadata.compatibility,
				secretVersion: digest(secret).sha256,
				engineDatabaseVersion: "revision",
			},
		};
		const auth = join(setup.root, "auth");
		await writeFile(auth, "test-token", { mode: 0o600 });
		let requests = 0;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				requests++;
				expect(request.headers.get("authorization")).toBe("Bearer test-token");
				if (request.method === "POST") {
					const binding = await request.json();
					if (mode === "wrong-binding") binding.boundaryReceiptId = "different-boundary";
					if (mode === "redirect") return Response.redirect("http://127.0.0.1:1/escape");
					return Response.json({
						version: 1,
						binding,
						database: digest(database),
						secret: digest(secret),
						revisions: ["revision"],
						tables: ["job"],
					});
				}
				return new Response(
					new URL(request.url).pathname.endsWith("/secret")
						? secret
						: mode === "corrupt-database"
							? "changed bytes"
							: database,
				);
			},
		});
		try {
			const result = exportEngineSnapshot({
				endpoint: server.url.href,
				authenticationFile: auth,
				directory: setup.snapshot,
				metadata,
				signal: new AbortController().signal,
			});
			if (mode === "complete") {
				const receipt = await result;
				expect(await readFile(join(setup.snapshot, "engine/database.sqlite"))).toEqual(database);
				expect(await readFile(join(setup.snapshot, "secrets/engine-secret"))).toEqual(secret);
				expect(JSON.parse(await readFile(join(setup.snapshot, "engine/receipt.json"), "utf8"))).toEqual(receipt);
				expect(requests).toBe(3);
			} else {
				await expect(result).rejects.toThrow();
				expect(await Bun.file(join(setup.snapshot, "engine/receipt.json")).exists()).toBe(false);
				expect(requests).toBe(mode === "corrupt-database" ? 2 : 1);
			}
		} finally {
			server.stop(true);
			await rm(setup.root, { recursive: true });
		}
	});
}
