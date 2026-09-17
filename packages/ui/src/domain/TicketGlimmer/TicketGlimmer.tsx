import { animate } from "motion/mini";
import { useEffect, useId, useRef } from "react";

export function TicketGlimmer({ active }: { active: boolean }) {
	const ref = useRef<HTMLSpanElement>(null);
	const id = useId();
	useEffect(() => {
		if (!active) return;
		const node = ref.current!;
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		let loops: ReturnType<typeof animate>[] = [];
		const sync = () => {
			if (media.matches) {
				for (const loop of loops) loop.cancel();
				loops = [];
				return;
			}
			if (!visible || document.hidden) {
				for (const loop of loops) loop.pause();
				return;
			}
			if (loops.length === 0) loops = createLoops(node, id);
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
		};
	}, [active, id]);
	if (!active) return null;
	return (
		<>
			<span ref={ref} aria-hidden="true" className="ticket-glimmer">
				<span className="ticket-glimmer-film" data-layer="wash" />
				<span className="ticket-glimmer-film" data-layer="bubble" />
				<span className="ticket-glimmer-film" data-layer="ripple" />
			</span>
			<span className="sr-only">Agent working</span>
		</>
	);
}

function createLoops(node: HTMLSpanElement, seed: string) {
	const random = createRandom(hash(seed));
	return Array.from(node.querySelectorAll<HTMLElement>(".ticket-glimmer-film"), (layer, index) => {
		const first = transformFrame(random, index);
		const transform = [first, ...Array.from({ length: 5 }, () => transformFrame(random, index)), first];
		const duration = 10 + index * 2.75 + random() * 3;
		const loop = animate(layer, { transform }, { duration, repeat: Infinity, ease: "easeInOut", autoplay: false });
		loop.time = random() * duration;
		return loop;
	});
}

function transformFrame(random: () => number, layer: number) {
	const reach = 6 + layer * 3;
	const x = ((random() * 2 - 1) * reach).toFixed(2);
	const y = ((random() * 2 - 1) * reach).toFixed(2);
	const rotation = ((random() * 2 - 1) * (12 + layer * 5)).toFixed(2);
	const scale = (0.94 + random() * 0.18).toFixed(3);
	return `translate3d(${x}%, ${y}%, 0) rotate(${rotation}deg) scale(${scale})`;
}

function hash(value: string) {
	let result = 2166136261;
	for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
	return result >>> 0;
}

function createRandom(seed: number) {
	let value = seed;
	return () => {
		value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
		return value / 4294967296;
	};
}
