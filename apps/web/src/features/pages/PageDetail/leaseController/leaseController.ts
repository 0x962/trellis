import { PAGE_RENDER_RENEW_MS, type PageRenderLease, type TrellisClient } from "@trellis/api";

export type LeaseState = { lease: PageRenderLease | null; error: unknown; refreshes: number };
type Dependencies = {
	pages: Pick<TrellisClient["pages"], "createRenderLease" | "renewRenderLease">;
	page: string;
	version: number;
	now: () => number;
	visible: () => boolean;
	setTimer: (callback: () => void, delay: number) => () => void;
	onChange: (state: LeaseState) => void;
};

export const leaseController = (deps: Dependencies) => {
	let state: LeaseState = { lease: null, error: null, refreshes: 0 };
	let stopped = false;
	let pending = false;
	let cancelTimer = () => {};
	const emit = () => {
		if (!stopped) deps.onChange({ ...state });
	};
	const schedule = () => {
		cancelTimer();
		if (stopped || !deps.visible() || state.lease === null) return;
		const remaining = Date.parse(state.lease.absoluteExpiresAt) - deps.now();
		cancelTimer = deps.setTimer(
			() => {
				void check();
			},
			Math.max(0, Math.min(PAGE_RENDER_RENEW_MS, remaining)),
		);
	};
	const create = async () => {
		const lease = await deps.pages.createRenderLease({ page: deps.page, version: deps.version });
		state = { lease, error: null, refreshes: state.refreshes + (state.lease === null ? 0 : 1) };
	};
	const check = async (replace = false) => {
		cancelTimer();
		if (stopped || pending || !deps.visible()) return;
		pending = true;
		try {
			const lease = state.lease;
			if (
				replace ||
				lease === null ||
				Math.min(Date.parse(lease.idleExpiresAt), Date.parse(lease.absoluteExpiresAt)) <= deps.now()
			) {
				await create();
			} else {
				try {
					state = { ...state, lease: await deps.pages.renewRenderLease({ leaseId: lease.id }), error: null };
				} catch (error) {
					if (!(error instanceof Error) || !("code" in error) || error.code !== "RENDER_LEASE_EXPIRED") throw error;
					await create();
				}
			}
		} catch (error) {
			state = { ...state, error };
		} finally {
			pending = false;
			emit();
			if (state.error === null) schedule();
		}
	};
	return {
		check,
		visibilityChanged: () => {
			cancelTimer();
			if (deps.visible()) void check();
		},
		stop: () => {
			stopped = true;
			cancelTimer();
		},
	};
};
