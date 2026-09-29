import { beforeEach, expect, test } from "bun:test";
import { createTrellisClient } from "@trellis/api/client";
import { ulid } from "ulid";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import type { Runtime, ServiceTransport } from "./db/transport.ts";
import type { Bus } from "./events/bus.ts";
import type { Logger } from "./log.ts";

const ORIGIN = "http://127.0.0.1:4521";
const at = "2026-09-29T07:00:00.000Z";
const actor = { name: "Navid", kind: "human" as const };
const projectId = ulid();
const ticketId = ulid();
const pullRequestId = ulid();
const received: Array<{ name: string; size: number }> = [];

const commands = {
	startCommand: "claude --dangerously-skip-permissions {{prompt}}",
	resumeCommand: "claude --dangerously-skip-permissions --resume {{sessionId}} {{resumeText}}",
};

const sessionOutput = () => {
	const runId = ulid();
	return {
		id: ulid(),
		name: "Upload test",
		projectId: null,
		projectKey: "",
		directory: "/tmp/upload-test",
		harness: { preset: "claude" as const, ...commands },
		runId,
		pinnedAt: null,
		archivedAt: null,
		createdAt: at,
		updatedAt: at,
		run: {
			id: runId,
			name: "Upload test",
			accountId: null,
			switchedTo: null,
			runtime: "native" as const,
			harness: { preset: "claude" as const, ...commands },
			kind: "session" as const,
			projectId: null,
			projectKey: "",
			ticketId: null,
			ticketIdentifier: null,
			ticketTitle: null,
			ticketStatusCategory: null,
			ticketEpicId: null,
			ticketEpicProjectId: null,
			pinnedAt: null,
			assigned: true,
			state: "running" as const,
			processStatus: "running" as const,
			observation: null,
			workspaceId: "/tmp/upload-test",
			terminalId: "terminal",
			url: null,
			error: null,
			sessionId: null,
			sessionLost: false,
			activityAt: null,
			createdAt: at,
			updatedAt: at,
		},
	};
};

const transport = {
	call: async (name: string, _ctx: unknown, input: { file?: File; files?: File[] }) => {
		const file = input.file ?? input.files?.[0];
		if (file) received.push({ name, size: file.size });
		const sha256 = "a".repeat(64);
		switch (name) {
			case "attachments.upload": {
				const attachment = {
					id: ulid(),
					ticketId,
					filename: file!.name,
					mime: file!.type,
					size: file!.size,
					sha256,
					actor,
					createdAt: at,
					url: "/api/attachments/file/file",
				};
				return { attachment, url: attachment.url, markdown: `[${file!.name}](${attachment.url})` };
			}
			case "pullRequests.uploadFile":
				return {
					id: ulid(),
					pullRequestId,
					sha256,
					url: "/api/evidence/file/file",
					filename: file!.name,
					mime: file!.type,
					size: file!.size,
				};
			case "pages.upload":
				return {
					id: ulid(),
					projectId,
					sha256,
					size: file!.size,
					mime: file!.type,
					originalName: file!.name,
					actor,
					createdAt: at,
					expiresAt: "2026-09-30T07:00:00.000Z",
				};
			case "resources.add":
				return {
					id: ulid(),
					epicId: ulid(),
					kind: "file",
					name: file!.name,
					body: null,
					url: null,
					blob: { sha256, url: "/api/resources/file/blob", size: file!.size },
					ticketId: null,
					pullRequestNumber: null,
					actor,
					createdAt: at,
					updatedAt: at,
				};
			case "sessions.create":
				return sessionOutput();
			default:
				throw new Error(name);
		}
	},
} as unknown as ServiceTransport;

const app = createApp({
	config: {
		home: "/tmp/trellis-upload-route-test",
		authToken: null,
		host: "127.0.0.1",
		allowedHosts: [],
		port: 4521,
		webDist: "/tmp/trellis-upload-route-test/web",
	} as unknown as Config,
	log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger,
	transport,
	bus: {} as Bus,
	runtime: { version: "test", bootId: ulid() } as Runtime,
}).app;

const largeFile = () =>
	new File([new Uint8Array(1024 * 1024 + 1).fill(7)], "large.bin", { type: "application/octet-stream" });

const form = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	body.set("file", largeFile());
	return body;
};

beforeEach(() => {
	received.length = 0;
});

test("the REST routes pass complete valid uploads above one MiB", async () => {
	const headers = { "x-trellis-actor": "human:Navid" };
	const sessionForm = new FormData();
	sessionForm.set("prompt", "Read the file.");
	sessionForm.set("name", "Upload test");
	sessionForm.append("files", largeFile());
	sessionForm.append("files", new File(["second"], "second.txt", { type: "text/plain" }));
	const requests = [
		app.request(`${ORIGIN}/api/tickets/TRL-1/attachments`, {
			method: "POST",
			headers,
			body: form({}),
		}),
		app.request(`${ORIGIN}/api/prs/${pullRequestId}/files/${ulid()}`, {
			method: "PUT",
			headers,
			body: form({}),
		}),
		app.request(`${ORIGIN}/api/page-uploads`, {
			method: "POST",
			headers,
			body: form({ project: "TRL" }),
		}),
		app.request(`${ORIGIN}/api/resources`, {
			method: "POST",
			headers,
			body: form({ epic: "TRL/uploads", kind: "file", name: "large.bin" }),
		}),
		app.request(`${ORIGIN}/api/sessions`, {
			method: "POST",
			headers,
			body: sessionForm,
		}),
	];
	const responses = await Promise.all(requests);
	expect(responses.map(({ status }) => status)).toEqual([201, 200, 200, 201, 201]);
	expect(received).toHaveLength(5);
	expect(received.every(({ size }) => size > 1024 * 1024)).toBe(true);
});

test("the RPC routes pass complete valid uploads above one MiB", async () => {
	const client = createTrellisClient(ORIGIN, "human:Navid", (request) => app.request(request));
	await client.attachments.upload({ ticket: "TRL-1", file: largeFile() });
	await client.pullRequests.uploadFile({ id: pullRequestId, fileId: ulid(), file: largeFile() });
	await client.pages.upload({ project: "TRL", file: largeFile() });
	await client.resources.add({ epic: "TRL/uploads", kind: "file", name: "large.bin", file: largeFile() });
	await client.sessions.create({ prompt: "Read the file.", name: "Upload test", files: [largeFile()] });

	expect(received).toHaveLength(5);
	expect(received.every(({ size }) => size > 1024 * 1024)).toBe(true);
});
