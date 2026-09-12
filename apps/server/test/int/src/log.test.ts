import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger, createRotatingSink, type LogRecord } from "../../../src/log.ts";
import { createTestApp, type TestApp } from "../../helpers/app.ts";

// The logger writes one record per call. A record is one JSON line on a
// pipe or a file, and pretty text on a terminal outside production. The
// rotating sink keeps `server.log` under 10 MB and keeps at most five
// rotated files beside it, so the logs on disk never pass 60 MB.

const MB = 1024 * 1024;

const capture = (isTTY = false) => {
	const lines: string[] = [];
	return { lines, sink: { isTTY, write: (line: string) => void lines.push(line.trimEnd()) } };
};

const record = (line: string) => JSON.parse(line) as LogRecord;

// One record of about 1 KB, so 10 MB is about 10 000 records.
const padded = (i: number) => "x".repeat(1000 - String(i).length);

const rotated = (dir: string) => readdirSync(dir).filter((name) => /^server\.log\.\d+$/.test(name));

const bytesOnDisk = (dir: string) => readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);

describe("logger", () => {
	test("the logger writes one JSON line per record", () => {
		const { lines, sink } = capture();
		const log = createLogger({ level: "info", sink, env: {} });

		log.info("listening", { port: 4521 });

		expect(lines).toHaveLength(1);
		const parsed = record(lines[0]!);
		expect(parsed.level).toBe("info");
		expect(parsed.msg).toBe("listening");
		expect(parsed.port).toBe(4521);
		expect(Date.parse(parsed.ts)).toBeGreaterThan(0);
		expect(lines[0]).not.toContain("\n");
	});

	test("the logger prints pretty text on a TTY outside production", () => {
		const { lines, sink } = capture(true);
		const log = createLogger({ level: "info", sink, env: { NODE_ENV: "development" } });

		log.info("listening", { port: 4521 });

		expect(lines).toHaveLength(1);
		expect(() => JSON.parse(lines[0]!)).toThrow();
		expect(lines[0]).toContain("listening");
		expect(lines[0]).toContain("4521");
	});

	test("the logger drops a record below the configured level", () => {
		const { lines, sink } = capture();
		const log = createLogger({ level: "info", sink, env: {} });

		log.debug("request", { method: "GET" });

		expect(lines).toEqual([]);
	});
});

describe("rotating sink", () => {
	test("the sink rotates at 10 MB and keeps five files", () => {
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "logs-"));
		const sink = createRotatingSink({ path: join(dir, "server.log"), maxBytes: 10 * MB, maxFiles: 5 });

		const count = Math.ceil((10.5 * MB) / 1000);
		for (let i = 0; i < count; i += 1) sink.write(`{"i":${i},"pad":"${padded(i)}"}`);
		sink.close();

		const current = readFileSync(join(dir, "server.log"), "utf8");
		expect(statSync(join(dir, "server.log")).size).toBeLessThan(10 * MB);
		expect(current.trimEnd().split("\n").at(-1)).toContain(`"i":${count - 1},`);
		expect(existsSync(join(dir, "server.log.1"))).toBe(true);
		const previous = readFileSync(join(dir, "server.log.1"), "utf8");
		expect(previous).toContain('{"i":0,');
		expect(previous.trimEnd().split("\n").at(-1)).not.toContain(`"i":${count - 1},`);
		expect(rotated(dir).length).toBeLessThanOrEqual(5);
	});

	test("the sink deletes the sixth file so the logs stay under 60 MB", () => {
		const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "logs-"));
		for (let n = 1; n <= 5; n += 1) writeFileSync(join(dir, `server.log.${n}`), `old-${n}\n`);
		writeFileSync(join(dir, "server.log"), `current\n${"x".repeat(10 * MB - 100)}\n`);
		const sink = createRotatingSink({ path: join(dir, "server.log"), maxBytes: 10 * MB, maxFiles: 5 });

		sink.write(`{"after":"rotation","pad":"${padded(0)}"}`);
		sink.close();

		expect(readdirSync(dir).sort()).toEqual([
			"server.log",
			"server.log.1",
			"server.log.2",
			"server.log.3",
			"server.log.4",
			"server.log.5",
		]);
		expect(readFileSync(join(dir, "server.log"), "utf8")).toContain('"after":"rotation"');
		expect(readFileSync(join(dir, "server.log.1"), "utf8")).toStartWith("current");
		expect(readFileSync(join(dir, "server.log.5"), "utf8")).toBe("old-4\n");
		for (const name of readdirSync(dir)) expect(readFileSync(join(dir, name), "utf8")).not.toContain("old-5");
		expect(bytesOnDisk(dir)).toBeLessThanOrEqual(60 * MB);
	});
});

describe("request logging", () => {
	let t: TestApp;
	beforeAll(async () => {
		t = await createTestApp({ logLevel: "debug" });
		await t.seedProject("CDE");
	});
	afterAll(() => t.close());

	const requestRecords = () => t.records.filter((entry) => entry.msg === "request");

	test("a GET request logs at debug", async () => {
		t.records.length = 0;

		const response = await t.api("/api/health");

		expect(response.status).toBe(200);
		const [line] = requestRecords();
		expect(line).toBeDefined();
		expect(line!.level).toBe("debug");
		expect(line!.method).toBe("GET");
		expect(line!.path).toBe("/api/health");
	});

	test("a mutating request logs at info with the request fields", async () => {
		t.records.length = 0;

		const response = await t.api("/api/tickets", { method: "POST", body: { project: "CDE", title: "Log me" } });

		expect(response.status).toBe(201);
		const [line] = requestRecords();
		expect(line).toBeDefined();
		expect(line!.level).toBe("info");
		expect(line!.method).toBe("POST");
		expect(line!.path).toBe("/api/tickets");
		expect(line!.status).toBe(201);
		expect(typeof line!.ms).toBe("number");
		expect(line!.actor).toBe("human:dana");
		expect(line!.reqId).toBe(response.headers.get("x-request-id"));
	});
});
