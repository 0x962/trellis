import { afterEach, beforeEach, expect, test } from "bun:test";
import { createConnection, createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	RuntimeCaptureBinding,
	RuntimeCaptureProducer,
	RuntimeCaptureRequest,
} from "@trellis/runtime-protocol";
import { CaptureFrameDecoder, encodeCaptureFrame } from "@trellis/runtime-protocol/capture-wire";
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

test("a disconnect after the last seal aborts the action without finalization", async () => {
	const completed = Promise.withResolvers<void>();
	let signal: AbortSignal | undefined;
	let sealed = false;
	let finalized = false;
	const store = {
		capture: async (
			_request: RuntimeCaptureRequest,
			action: (producer: RuntimeCaptureProducer) => Promise<unknown>,
			captureSignal: AbortSignal,
		) => {
			signal = captureSignal;
			const producer: RuntimeCaptureProducer = {
				binding,
				signal: captureSignal,
				inventory: async () => ({ binding, entries: [], unavailable: [] }),
				read: async function* () {},
				seal: async () => {
					sealed = true;
					return new Uint8Array([1]);
				},
			};
			try {
				await action(producer);
				finalized = true;
				throw new Error("The fixture expected a disconnect");
			} finally {
				completed.resolve();
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
	const decoder = new CaptureFrameDecoder();
	await new Promise<void>((resolve, reject) => {
		client.once("error", reject);
		client.on("data", (chunk) => {
			for (const frame of decoder.push(chunk)) {
				if (frame.type === "binding")
					client.write(
						encodeCaptureFrame({
							type: "seal",
							input: { binding, rootId: "root-1", manifestSha256: "a".repeat(64) },
						}),
					);
				if (frame.type === "receipt") {
					client.destroy();
					resolve();
				}
			}
		});
	});
	await completed.promise;
	expect(sealed).toBe(true);
	expect(signal?.aborted).toBe(true);
	expect(finalized).toBe(false);
	expect(client.destroyed).toBe(true);
});
