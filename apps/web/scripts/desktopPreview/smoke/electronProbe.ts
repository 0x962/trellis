import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { app, BrowserWindow, ipcMain } from "electron";
import { rendererPath } from "../../../../desktop/src/navigation/navigation";
import { secureRenderer } from "../../../../desktop/src/secureRenderer/secureRenderer";
import { trustRenderer } from "../../../../desktop/src/trustRenderer";
import { createUiPreview } from "../../../../desktop/src/uiPreview";

type Input = { directory: string; hostOrigin: string; previewOrigin: string; token: string };
async function main() {
	const input: Input = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
	mkdirSync(`${input.directory}/profile`);
	app.setPath("userData", `${input.directory}/profile`);
	await app.whenReady();
	const window = new BrowserWindow({
		show: false,
		webPreferences: {
			preload: `${input.directory}/preload.cjs`,
			sandbox: true,
			contextIsolation: true,
			partition: "preview-fixture",
		},
	});
	const currentOrigin = () => preview.origin() ?? input.hostOrigin;
	const preview = createUiPreview({
		hostOrigin: () => input.hostOrigin,
		reload: async () => {
			await window.loadURL(`${currentOrigin()}${rendererPath(window.webContents.getURL())}`);
		},
		changed: () => {},
	});
	secureRenderer(window, () => ({ origin: input.hostOrigin, token: input.token, pid: process.pid }), preview.origin);
	ipcMain.handle("trellis:desktop-status", (event) => {
		trustRenderer(event, window, currentOrigin());
		return { packaged: true, dataDirectory: "fixture", openAtLogin: false };
	});
	const evaluate = (source: string) => window.webContents.executeJavaScript(source);
	const until = async (source: string) => {
		const deadline = Date.now() + 15000;
		while (!(await evaluate(source))) {
			assert(Date.now() < deadline, `Timed out: ${source}`);
			await setTimeout(50);
		}
	};

	try {
		await window.loadURL(`${input.hostOrigin}/t/TRL-1`);
		console.log("Installed UI loads.");
		await evaluate("localStorage.setItem('fixture-tabs', 'saved')");
		assert.equal(await evaluate("document.body.textContent"), "Installed UI");
		await preview.apply([`--ui-preview=${input.previewOrigin}`]);
		await until("document.querySelector('button')?.textContent === 'Before: 0'");
		console.log("Preview UI loads.");
		assert.equal(new URL(window.webContents.getURL()).pathname, "/t/TRL-1");
		assert.equal((await evaluate("window.trellisDesktop.status()")).dataDirectory, "fixture");
		assert.deepEqual(
			await evaluate("fetch('/rpc/echo', { method: 'POST', body: 'complete payload' }).then(r => r.json())"),
			{ body: "complete payload" },
		);
		console.log("Native bridge and API POST pass.");
		assert.equal(
			await evaluate(
				"new Promise((resolve, reject) => { const s = new EventSource('/api/events'); s.onmessage = e => { s.close(); resolve(e.data); }; s.onerror = reject; })",
			),
			"ready",
		);
		console.log("SSE passes.");
		assert.equal(
			await evaluate(
				"new Promise((resolve, reject) => { const s = new WebSocket(location.origin.replace('http:', 'ws:') + '/api/socket'); s.onopen = () => s.send('terminal input'); s.onmessage = e => { s.close(); resolve(e.data); }; s.onerror = reject; })",
			),
			"terminal input",
		);
		console.log("Terminal WebSocket passes.");
		const timeOrigin = await evaluate("performance.timeOrigin");
		await evaluate("document.querySelector('button').click()");
		await until("document.querySelector('button')?.textContent === 'Before: 1'");
		const sourcePath = `${input.directory}/App.tsx`;
		const source = await readFile(sourcePath, "utf8");
		await writeFile(sourcePath, source.replace("Before", "After"));
		await until("document.querySelector('button')?.textContent === 'After: 1'");
		assert.equal(await evaluate("performance.timeOrigin"), timeOrigin);
		console.log("React hot reload retains component state.");
		await writeFile(`${input.directory}/style.css`, "button { color: rgb(0, 0, 255); }");
		await until("getComputedStyle(document.querySelector('button')).color === 'rgb(0, 0, 255)'");
		console.log("CSS hot reload passes.");
		const foreign = new BrowserWindow({ show: false, webPreferences: { sandbox: true, partition: "preview-fixture" } });
		try {
			await foreign.loadURL(input.previewOrigin);
			assert.equal(await foreign.webContents.executeJavaScript("fetch('/api/private').then(r => r.status)"), 401);
		} finally {
			foreign.destroy();
		}
		await fetch(`${input.hostOrigin}/stop-preview`);
		await preview.stop();
		assert.equal(await evaluate("document.body.textContent"), "Installed UI");
		assert.equal(await evaluate("localStorage.getItem('fixture-tabs')"), "saved");
		assert.equal(new URL(window.webContents.getURL()).pathname, "/t/TRL-1");
		console.log(
			"PASS: React and CSS hot reload; retained component state; API POST; SSE; terminal WebSocket; native bridge; foreign-window refusal; stop after server exit; saved installed tabs.",
		);
	} finally {
		window.destroy();
		app.quit();
	}
}

void main().catch((error) => {
	console.error(error);
	app.exit(1);
});
