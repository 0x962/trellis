import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageSourceAt, sourcePathOf } from "./pageSource.ts";

const root = () => mkdtempSync(join(tmpdir(), "trellis-page-source-"));

const write = (dir: string, path: string, text: string) => {
	const full = join(dir, path);
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, text);
	return full;
};

test("one file is the document of a page with no asset", () => {
	const dir = root();
	try {
		write(dir, "report.html", "<h1>Report</h1>");
		const source = pageSourceAt("report.html", dir);
		expect(source.document.name).toBe("index.html");
		expect(source.document.type).toContain("text/html");
		expect(source.assets).toEqual([]);
		expect(source.sourcePath).toBe("report.html");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a directory takes index.html as the document and every other file as an asset", async () => {
	const dir = root();
	try {
		write(dir, "site/index.html", "<h1>Site</h1>");
		write(dir, "site/style.css", "body{color:red}");
		write(dir, "site/media/logo.svg", "<svg/>");
		const source = pageSourceAt("site", dir);
		expect(await source.document.text()).toBe("<h1>Site</h1>");
		expect(source.assets.map((asset) => asset.path).sort()).toEqual(["media/logo.svg", "style.css"]);
		expect(source.sourcePath).toBe("site");
		const style = source.assets.find((asset) => asset.path === "style.css")!;
		// The stored type reaches the content route, so a reader of the page
		// gets the stylesheet as a stylesheet.
		expect(style.file.type).toContain("text/css");
		expect(style.file.name).toBe("style.css");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a directory without index.html ends the run", () => {
	const dir = root();
	try {
		write(dir, "site/style.css", "body{}");
		expect(() => pageSourceAt("site", dir)).toThrow("site holds no index.html");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a file the page cannot hold names itself", () => {
	const dir = root();
	try {
		write(dir, "site/index.html", "<h1>Site</h1>");
		write(dir, "site/.trellis/notes.txt", "private");
		expect(() => pageSourceAt("site", dir)).toThrow(".trellis/notes.txt cannot be an asset path");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a link to a file is read and a link to a directory is left out", () => {
	const dir = root();
	try {
		write(dir, "site/index.html", "<h1>Site</h1>");
		write(dir, "outside/data.json", "{}");
		symlinkSync(join(dir, "outside/data.json"), join(dir, "site/data.json"));
		symlinkSync(join(dir, "outside"), join(dir, "site/outside"));
		expect(pageSourceAt("site", dir).assets.map((asset) => asset.path)).toEqual(["data.json"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a path that no file holds ends the run", () => {
	const dir = root();
	try {
		expect(() => pageSourceAt("missing.html", dir)).toThrow("No file at missing.html");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("a source path under the current directory stays relative", () => {
	expect(sourcePathOf("docs/report.html", "/work")).toBe("docs/report.html");
	expect(sourcePathOf("./docs/report.html", "/work")).toBe("docs/report.html");
	expect(sourcePathOf("/work/docs/report.html", "/work")).toBe("docs/report.html");
});

test("a source path outside the current directory records its last segment", () => {
	expect(sourcePathOf("/tmp/build/report.html", "/work")).toBe("report.html");
	expect(sourcePathOf("../report.html", "/work")).toBe("report.html");
	expect(sourcePathOf("/work", "/work")).toBe("work");
});
