import { mock } from "bun:test";
import { waitFor } from "@testing-library/react";
import type { TestServer } from "./server/index.ts";

// Helpers for the Needs you tests. The seed behind `createTestServer` holds
// three review rows, one failing-CI row, one stalled row, and six rows the
// agents finished today.

// The Review section in the order the server returns: the ticket whose last
// change is oldest sits first.
export const seededReview = ["TRL-9", "CDE-37", "CDE-42"];

export const callsTo = (server: TestServer, path: string) =>
	server.calls.filter((call) => call.path.join(".") === path);

export const lastCallTo = (server: TestServer, path: string) => callsTo(server, path).at(-1);

// The first element that matches `selector`, once it is on the page.
export const waitForElement = async (selector: string) =>
	await waitFor(() => {
		const element = document.querySelector<HTMLElement>(selector);
		if (element === null) throw new Error(`No element matches ${selector}.`);
		return element;
	});

// The row element for `identifier`. Every Needs you row carries its
// identifier in `data-inbox-row`.
export const rowOf = async (identifier: string) =>
	await waitFor(() => {
		const row = document.querySelector<HTMLElement>(`[data-inbox-row="${identifier}"]`);
		if (row === null) throw new Error(`No Needs you row for ${identifier}.`);
		return row;
	});

export const focusRow = async (identifier: string) => {
	const row = await rowOf(identifier);
	row.focus();
	return row;
};

export const statusOf = async (server: TestServer, project: string, slug: string) => {
	const { statuses } = await server.client.statuses.list({ project });
	return statuses.find((status) => status.slug === slug)!;
};

// A second done status after Done, so the approve target is a choice between
// two and not the only done status there is.
export const addArchivedStatus = async (server: TestServer) => {
	await server.client.statuses.create({ project: "CDE", name: "Archived", category: "done", position: 6 });
};

export const setTemplate = async (server: TestServer, template: string) => {
	const settings = await server.client.settings.get();
	await server.client.settings.set({ ...settings, startWithAgentTemplate: template });
};

export type ClipboardMock = {
	writeText: ReturnType<typeof mock>;
	// Every text the page copied, oldest first.
	written: string[];
};

// Replaces `navigator.clipboard` with a recorder. `fails` makes every write
// reject, which is what a browser does when it refuses the permission.
export const mockClipboard = (fails = false): ClipboardMock => {
	const written: string[] = [];
	const writeText = mock((text: string) => {
		if (fails) return Promise.reject(new Error("Write permission denied."));
		written.push(text);
		return Promise.resolve();
	});
	Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
	return { writeText, written };
};

// A server whose responses wait for `release`. The test reads what the page
// paints while a mutation is still in flight.
export const gatedServer = (server: TestServer) => {
	const waiting: Array<() => void> = [];
	let holding = false;
	const fetch: TestServer["fetch"] = async (request, init) => {
		if (holding) await new Promise<void>((resolve) => waiting.push(resolve));
		return server.fetch(request, init);
	};
	return {
		server: { ...server, fetch },
		hold: () => {
			holding = true;
		},
		release: () => {
			holding = false;
			for (const resolve of waiting.splice(0)) resolve();
		},
	};
};

// A server whose first `count` requests fail the way a dropped connection
// does. The client sees a rejected fetch, not an error response.
export const flakyServer = (server: TestServer, count: number) => {
	let left = count;
	const fetch: TestServer["fetch"] = (request, init) => {
		if (left > 0) {
			left -= 1;
			return Promise.reject(new TypeError("Failed to fetch"));
		}
		return server.fetch(request, init);
	};
	return { ...server, fetch };
};
