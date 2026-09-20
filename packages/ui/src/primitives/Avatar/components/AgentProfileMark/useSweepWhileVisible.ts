import { type RefObject, useEffect } from "react";

/*
 * The browser keeps painting an animation that nobody can see. The span of the
 * band starts paused, and this hook adds `data-sweep="run"` to it only while
 * the span is inside the viewport and the tab is visible.
 */
export function useSweepWhileVisible(ref: RefObject<HTMLSpanElement | null>, working: boolean) {
	useEffect(() => {
		if (!working) return;
		const node = ref.current!;
		let onScreen = false;
		const sync = () => {
			if (onScreen && !document.hidden) node.dataset.sweep = "run";
			else delete node.dataset.sweep;
		};
		const observer = new IntersectionObserver(([entry]) => {
			onScreen = entry!.isIntersecting;
			sync();
		});
		observer.observe(node);
		document.addEventListener("visibilitychange", sync);
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", sync);
		};
	}, [ref, working]);
}
