import { animate } from "motion/mini";
import { type RefObject, useEffect } from "react";
import type { PersonaState } from "../personaAppearance";
import { trellisPoses } from "../trellisPoses";

export function usePersonaMotion(ref: RefObject<SVGSVGElement | null>, state: PersonaState, id: string) {
	useEffect(() => {
		if (state === "static") return;
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
				loops = createLoops(node, state);
				const phase = ([...id].reduce((value, char) => value + char.charCodeAt(0), 0) * 0.43) % 3;
				if (state === "working-mild") for (const loop of loops) loop.time = phase;
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
	}, [ref, state, id]);
}

function createLoops(node: SVGSVGElement, state: PersonaState) {
	const options = { duration: 3, repeat: Infinity, autoplay: false };
	const loops = [
		animate(
			node.querySelector<SVGRectElement>(".persona-film")!,
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
			node.querySelector<SVGGElement>(".persona-glimmer")!,
			{ opacity: [0, 0, 0.82, 0.82, 0, 0] },
			{ ...options, times: [0, 0.02, 0.12, 0.86, 0.98, 1], ease: "linear" },
		),
	];
	if (state !== "working") return loops;
	const full = { duration: 2.2, repeat: Infinity, autoplay: false };
	for (const [i, frames] of trellisPoses.entries()) {
		for (const piece of node.querySelectorAll<SVGPathElement>(`[data-piece="${i}"]`)) {
			loops.push(
				animate(
					piece,
					{ d: frames },
					{
						...full,
						times: [0, 0.07, 0.18, 0.31, 0.65, 0.75, 0.87, 1],
						ease: frames.map(() => [0.4, 0, 0.2, 1] as [number, number, number, number]),
					},
				),
			);
			loops.push(
				animate(
					piece,
					{ opacity: [1, 1, [1, 0.62, 0.45, 0.82][i]!, [1, 0.62, 0.45, 0.82][i]!, 1, 1] },
					{
						...full,
						times: [0, 0.2, 0.31, 0.65, 0.83, 1],
						ease: Array.from({ length: 6 }, () => [0.4, 0, 0.2, 1] as [number, number, number, number]),
					},
				),
			);
		}
	}
	for (const rotor of node.querySelectorAll<SVGGElement>(".persona-rotor")) {
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
