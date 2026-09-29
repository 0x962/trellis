import { afterAll, afterEach } from "bun:test";
import { nativeLifecycleFixture } from "../../fixtures/nativeHost";

export const processEvidence: Record<string, unknown>[] = [];
const cleanupEvidence: unknown[] = [];
export const crashEvidence: Record<string, unknown>[] = [];
export const crashCleanupEvidence: Record<string, unknown>[] = [];
let close: (() => Promise<unknown>) | null = null;

afterEach(async () => {
	if (close !== null) cleanupEvidence.push(await close());
	close = null;
});

afterAll(() => {
	console.log(JSON.stringify({ processEvidence, cleanupEvidence, crashEvidence, crashCleanupEvidence }));
});

export const useFixture = async (...args: Parameters<typeof nativeLifecycleFixture>) => {
	const fixture = await nativeLifecycleFixture(...args);
	close = fixture.close;
	return fixture;
};

export const closeFixture = async () => {
	cleanupEvidence.push(await close!());
	close = null;
};

export const row = (rows: unknown[]) =>
	rows[0] as {
		key: string;
		run_id: string;
		attempt_id: string;
		result_id: string | null;
	};
