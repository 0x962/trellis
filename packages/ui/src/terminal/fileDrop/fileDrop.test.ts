import { describe, expect, mock, test } from "bun:test";
import { initialTerminalSnapshot } from "../TerminalSurface/terminalRuntime/types";
import { fileDrop } from "./fileDrop";

function setup(paths = ["/tmp/one file.txt"]) {
	const files = paths.map((_, index) => new File([], `file-${index}`));
	const getPathForFile = mock((file: File) => paths[files.indexOf(file)]!);
	const state = {
		...initialTerminalSnapshot,
		connection: "open" as "open" | "closed" | "connecting",
		controllable: true,
		view: { readOnly: false, getPathForFile } as {
			readOnly: boolean;
			getPathForFile?: (file: File) => string;
		} | null,
	};
	const insert = mock((_text: string) => {});
	const handlers = fileDrop(() => state, insert);
	const event = {
		dataTransfer: { types: ["Files"], files, dropEffect: "none" },
		preventDefault: mock(() => {}),
		stopPropagation: mock(() => {}),
	} as unknown as DragEvent;
	return { state, insert, handlers, event, getPathForFile };
}

describe("terminal file drop", () => {
	test("inserts one escaped path without Enter", () => {
		const h = setup();
		h.handlers.drop(h.event);
		expect(h.insert.mock.calls).toEqual([["/tmp/one\\ file.txt"]]);
		expect(h.event.preventDefault).toHaveBeenCalledTimes(1);
		expect(h.event.stopPropagation).toHaveBeenCalledTimes(1);
	});

	test("keeps multiple paths in order with one separator", () => {
		const h = setup(["/tmp/z file", "/tmp/a'file", "/tmp/b"]);
		h.handlers.drop(h.event);
		expect(h.insert.mock.calls).toEqual([["/tmp/z\\ file /tmp/a\\'file /tmp/b"]]);
	});

	test.each(["/bin/sh", "/bin/bash", "/bin/zsh"])("round trips shell characters through %s", (shell) => {
		const paths = ["/tmp/a b'\"\\c", "/tmp/$(printf BAD);`printf BAD`&|<>*?[]{}()!~#$x", "/tmp/é雪"];
		const h = setup(paths);
		h.handlers.drop(h.event);
		const inserted = h.insert.mock.calls[0]![0];
		expect(inserted).not.toMatch(/\p{Cc}/u);
		const result = Bun.spawnSync([shell, "-c", `printf '%s\\0' ${inserted}`]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe(`${paths.join("\0")}\0`);
	});

	test.each(["readOnly", "stopped", "closed", "connecting", "uncontrollable", "error", "detached", "browser"])(
		"sends no input for %s",
		(condition) => {
			const h = setup();
			if (condition === "readOnly") h.state.view!.readOnly = true;
			if (condition === "stopped") h.state.stopped = true;
			if (condition === "closed" || condition === "connecting") h.state.connection = condition;
			if (condition === "uncontrollable") h.state.controllable = false;
			if (condition === "error") h.state.error = "Disconnected";
			if (condition === "detached") h.state.view = null;
			if (condition === "browser") h.state.view!.getPathForFile = undefined;
			h.handlers.dragover(h.event);
			h.handlers.drop(h.event);
			expect(h.event.dataTransfer!.dropEffect).toBe("none");
			expect(h.getPathForFile).not.toHaveBeenCalled();
			expect(h.insert).not.toHaveBeenCalled();
		},
	);

	test("checks the current permissions at drop time", () => {
		const h = setup();
		h.handlers.dragover(h.event);
		expect(h.event.dataTransfer!.dropEffect).toBe("copy");
		h.state.view!.readOnly = true;
		h.handlers.drop(h.event);
		expect(h.insert).not.toHaveBeenCalled();
	});

	test.each([
		"",
		"relative.txt",
		"/tmp/line\nbreak",
		"/tmp/return\rkey",
		"/tmp/tab\tkey",
		"/tmp/escape\x1bkey",
		"/tmp/line\u2028break",
	])("rejects the whole drop for an unsafe or absent path %j", (path) => {
		const h = setup(["/tmp/valid", path]);
		h.handlers.drop(h.event);
		expect(h.insert).not.toHaveBeenCalled();
	});

	test("leaves text and app drags unchanged", () => {
		const h = setup();
		Object.assign(h.event.dataTransfer!, { types: ["text/plain", "application/x-trellis-ticket"] });
		h.handlers.dragover(h.event);
		h.handlers.drop(h.event);
		expect(h.event.preventDefault).not.toHaveBeenCalled();
		expect(h.event.stopPropagation).not.toHaveBeenCalled();
		expect(h.insert).not.toHaveBeenCalled();
	});
});
