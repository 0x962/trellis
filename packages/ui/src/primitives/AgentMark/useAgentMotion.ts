import { animate } from "motion/mini";
import { type RefObject, useEffect } from "react";
import type { AgentMarkState } from "./agentAppearance";
import { trellisPoses } from "./trellisPoses";

export function useAgentMotion(
	ref: RefObject<SVGSVGElement | null>,
	state: AgentMarkState,
	id: string,
	artworkMotion: boolean,
) {
	useEffect(() => {
		if (state !== "working") return;
		const node = ref.current!;
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		let loops: ReturnType<typeof animate>[] = [];
		const sync = () => {
			if (media.matches) {
				for (const loop of loops) loop.cancel();
				loops = [];
				delete node.dataset.motion;
				return;
			}
			if (!visible || document.hidden) {
				for (const loop of loops) loop.pause();
				return;
			}
			if (loops.length === 0) {
				loops = createLoops(node, artworkMotion);
				const phase = ([...id].reduce((value, char) => value + char.charCodeAt(0), 0) * 0.43) % 2;
				for (const loop of loops) loop.time = phase;
				node.dataset.motion = "active";
			}
			for (const loop of loops) loop.play();
		};
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry!.isIntersecting;
			sync();
		});
		observer.observe(node);
		media.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			observer.disconnect();
			media.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			for (const loop of loops) loop.cancel();
			delete node.dataset.motion;
		};
	}, [ref, state, id, artworkMotion]);
}

function createLoops(node: SVGSVGElement, artworkMotion: boolean) {
	const options = { duration: 2, repeat: Infinity, autoplay: false };
	const loops = [
		animate(
			node.querySelector<SVGRectElement>(".agent-film")!,
			{
				transform: [
					"translate(-36px,-14px) rotate(-18deg)",
					"translate(-36px,-14px) rotate(-18deg)",
					"translate(58px,28px) rotate(18deg)",
					"translate(58px,28px) rotate(18deg)",
				],
			},
			{ ...options, times: [0, 0.02, 0.96, 1], ease: ["linear", [0.35, 0, 0.3, 1], "linear", "linear"] },
		),
		animate(
			node.querySelector<SVGGElement>(".agent-glimmer")!,
			{ opacity: [0, 0, 0.82, 0.82, 0, 0] },
			{ ...options, times: [0, 0.02, 0.12, 0.86, 0.98, 1], ease: "linear" },
		),
	];
	if (!artworkMotion) return loops;
	const full = { duration: 2, repeat: Infinity, autoplay: false };
	for (const [i, frames] of trellisPoses.entries()) {
		for (const piece of node.querySelectorAll<SVGPathElement>(`[data-piece="${i}"]`)) {
			loops.push(animate(piece, { d: frames }, { ...full, times: [0, 0.07, 0.18, 0.31, 0.65, 0.75, 0.87, 1] }));
		}
	}
	for (const rotor of node.querySelectorAll<SVGGElement>(".agent-rotor")) {
		loops.push(
			animate(
				rotor,
				{ transform: ["rotate(0deg)", "rotate(0deg)", "rotate(720deg)", "rotate(720deg)"] },
				{ ...full, times: [0, 0.31, 0.65, 1], ease: ["linear", [0.45, 0, 0.55, 1], "linear", "linear"] },
			),
		);
	}
	return loops;
}
