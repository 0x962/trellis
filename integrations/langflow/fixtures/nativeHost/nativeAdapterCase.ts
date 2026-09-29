import { expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openNativeAdapterFixture } from "./nativeAdapterFixture.ts";
import { createNativeAdapterFixture } from "./nativeAdapterSetup.ts";

export async function nativeAdapterCase(
	action: (input: {
		home: string;
		current: () => Awaited<ReturnType<typeof openNativeAdapterFixture>>;
		reopen: () => Promise<void>;
	}) => Promise<void>,
) {
	const home = await mkdtemp(join(tmpdir(), "trellis-native-adapter-"));
	const opened: Awaited<ReturnType<typeof openNativeAdapterFixture>>[] = [];
	let active: Awaited<ReturnType<typeof openNativeAdapterFixture>> | null = null;
	const reopen = async () => {
		if (active !== null) {
			await active.close();
			active = null;
		}
		active = await openNativeAdapterFixture(home);
		opened.push(active);
	};
	try {
		await createNativeAdapterFixture(home);
		await reopen();
		await action({ home, current: () => active!, reopen });
	} finally {
		if (active !== null) await active.close();
		const observations = [];
		for (const fixture of opened) {
			const before = await fixture.processes.records();
			const stopped = await fixture.processes.close();
			observations.push({
				before: before.map(({ id, pid, status, exitCode }) => ({ id, pid, status, exitCode })),
				...stopped,
			});
			expect(stopped.survivingPids).toEqual([]);
		}
		await rm(home, { recursive: true });
		expect(await Bun.file(join(home, "adapter.json")).exists()).toBe(false);
		console.log(JSON.stringify({ kind: "native-adapter-cleanup", home, observations, removed: true }));
	}
}
