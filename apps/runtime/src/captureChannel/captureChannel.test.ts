import { afterEach, beforeEach, expect, test } from "bun:test";
import { createConnection, createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	RuntimeCaptureAction,
	RuntimeCaptureBinding,
	RuntimeCaptureProducer,
	RuntimeCaptureRequest,
} from "@trellis/runtime-protocol";
import type { SessionStore } from "../sessionStore.ts";
import { serveCaptureChannel } from "./captureChannel.ts";

let directory: string;
let server: Server | undefined;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-capture-channel-"));
});

afterEach(async () => {
	const current = server;
	if (current !== undefined) await new Promise<void>((resolve) => current.close(() => resolve()));
	await rm(directory, { recursive: true, force: true });
});

const request: RuntimeCaptureRequest = {
	captureId: "capture-1",
	snapshotId: "snapshot-1",
	hostId: "host-1",
	dataHomeId: "home-1",
	generation: 1,
	blockId: "block-1",
	identities: [],
};

const binding: RuntimeCaptureBinding = { ...request, workspaces: [], roots: [] };

test("a client disconnect releases the retained capture action", async () => {
	const released = Promise.withResolvers<void>();
	const producer: RuntimeCaptureProducer = {
		binding,
		inventory: async () => ({ binding, entries: [], unavailable: [] }),
		read: async function* () {},
		seal: async () => new Uint8Array(),
	};
	const store = {
		capture: async <T>(_request: RuntimeCaptureRequest, action: RuntimeCaptureAction<T>) => {
			try {
				return await action(producer);
			} finally {
				released.resolve();
			}
		},
	} as unknown as SessionStore;
	server = createServer((socket) => {
		void serveCaptureChannel(store, socket, request, Buffer.alloc(0));
	});
	const socketPath = join(directory, "runtime.sock");
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, resolve);
	});
	const client = createConnection(socketPath);
	await new Promise<void>((resolve, reject) => {
		client.once("error", reject);
		client.once("data", () => {
			client.destroy();
			resolve();
		});
	});
	await released.promise;
	expect(client.destroyed).toBe(true);
});
