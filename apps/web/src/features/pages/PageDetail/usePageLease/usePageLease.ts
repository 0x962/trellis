import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { type LeaseState, leaseController } from "../leaseController";

export const usePageLease = (page: string, version: number) => {
	const { client, live } = useApp();
	const [state, setState] = useState<LeaseState>({ lease: null, error: null, refreshes: 0 });
	const controller = useRef<ReturnType<typeof leaseController> | null>(null);
	useEffect(() => {
		const current = leaseController({
			pages: client.pages,
			page,
			version,
			now: Date.now,
			visible: () => document.visibilityState === "visible",
			setTimer: (callback, delay) => {
				const timer = setTimeout(callback, delay);
				return () => clearTimeout(timer);
			},
			onChange: setState,
		});
		controller.current = current;
		void current.check();
		document.addEventListener("visibilitychange", current.visibilityChanged);
		const unsubscribe = live.status.subscribe(() => {
			if (live.status.get() === "live") void current.check();
		});
		return () => {
			current.stop();
			unsubscribe();
			document.removeEventListener("visibilitychange", current.visibilityChanged);
		};
	}, [client, live, page, version]);
	return { ...state, retry: () => void controller.current!.check(true) };
};
