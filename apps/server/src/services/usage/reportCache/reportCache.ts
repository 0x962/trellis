import type { UsageDays, UsageReport } from "@trellis/api";
import { reportStorage } from "./components/storage";

type Slot = {
	loaded: Promise<void>;
	current?: UsageReport;
	previous?: UsageReport;
	pending?: Promise<UsageReport>;
};
type Home = { ranges: Map<UsageDays, Slot>; storage: Promise<void> };

// A completed report remains readable while a scan builds its replacement.
// File operations share a queue so account invalidation also removes an in-flight save.
export const createReportCache = (storage = reportStorage) => {
	const homes = new Map<string, Home>();
	const homeState = (home: string) => {
		let state = homes.get(home);
		if (!state) {
			state = { ranges: new Map(), storage: Promise.resolve() };
			homes.set(home, state);
		}
		return state;
	};
	const fileOperation = <T>(state: Home, operation: () => Promise<T>) => {
		const result = state.storage.then(operation);
		state.storage = result.then(
			() => {},
			() => {},
		);
		return result;
	};
	const load = (home: string, days: UsageDays) => {
		const state = homeState(home);
		let slot = state.ranges.get(days);
		if (!slot) {
			const created: Slot = { loaded: Promise.resolve() };
			created.loaded = fileOperation(state, () => storage.read(home, days)).then((report) => {
				created.current = report;
			});
			state.ranges.set(days, created);
			slot = created;
		}
		return { state, slot };
	};
	return {
		async report(home: string, days: UsageDays, refresh: boolean, build: () => Promise<UsageReport>) {
			const { state, slot } = load(home, days);
			await slot.loaded;
			if (!refresh && slot.current) return slot.current;
			if (slot.pending) return slot.pending;
			slot.pending = (async () => {
				const report = await build();
				await fileOperation(state, async () => {
					if (state.ranges.get(days) !== slot) return;
					await storage.write(home, days, report);
					slot.previous = slot.current;
					slot.current = report;
				});
				return report;
			})().finally(() => {
				slot.pending = undefined;
			});
			return slot.pending;
		},
		async ranking(home: string, days: UsageDays, computedAt: string) {
			const { slot } = load(home, days);
			await slot.loaded;
			return [slot.current, slot.previous].find((report) => report?.computedAt === computedAt);
		},
		invalidate(home: string) {
			const state = homeState(home);
			state.ranges.clear();
			return fileOperation(state, () => storage.remove(home));
		},
	};
};
