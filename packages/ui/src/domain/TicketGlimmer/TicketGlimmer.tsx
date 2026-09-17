import { animate } from "motion/mini";
import { useEffect, useRef } from "react";

type MotionControl = ReturnType<typeof animate>;

type DriftControl = {
	play: () => void;
	pause: () => void;
	cancel: () => void;
};

type ImpactMotion = {
	angle: number;
	trailX: number;
	trailY: number;
	intensity: number;
};

export function TicketGlimmer({ active }: { active: boolean }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (!active) return;
		const node = ref.current!;
		const surface = node.parentElement!;
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		let pointerTrack: { x: number; y: number; time: number } | null = null;
		let drifts: DriftControl[] = [];
		let impacts: ReturnType<typeof createImpactBursts> | null = null;
		const stopImpacts = () => {
			impacts?.cancel();
			impacts = null;
		};
		const sync = () => {
			if (media.matches) {
				for (const drift of drifts) drift.cancel();
				drifts = [];
				stopImpacts();
				return;
			}
			if (!visible || document.hidden) {
				for (const drift of drifts) drift.pause();
				stopImpacts();
				return;
			}
			if (drifts.length === 0) drifts = createDrifts(node);
			for (const drift of drifts) drift.play();
			impacts ??= createImpactBursts(node);
		};
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry!.isIntersecting;
			sync();
		});
		const handlePointerMove = (event: PointerEvent) => {
			const now = performance.now();
			if (!impacts) return;
			if (!pointerTrack) {
				pointerTrack = { x: event.clientX, y: event.clientY, time: now };
				return;
			}
			const elapsed = now - pointerTrack.time;
			if (elapsed < 80) return;
			const deltaX = event.clientX - pointerTrack.x;
			const deltaY = event.clientY - pointerTrack.y;
			const distance = Math.hypot(deltaX, deltaY);
			if (distance === 0) return;
			const speed = distance / elapsed;
			const trailDistance = Math.min(42, 9 + speed * 22);
			pointerTrack = { x: event.clientX, y: event.clientY, time: now };
			const bounds = node.getBoundingClientRect();
			impacts.trigger(
				((event.clientX - bounds.left) / bounds.width) * 100,
				((event.clientY - bounds.top) / bounds.height) * 100,
				{
					angle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
					trailX: (deltaX / distance) * trailDistance,
					trailY: (deltaY / distance) * trailDistance,
					intensity: Math.min(1, 0.28 + speed * 0.55),
				},
			);
		};
		const handlePointerLeave = () => {
			pointerTrack = null;
		};
		observer.observe(node);
		surface.addEventListener("pointermove", handlePointerMove);
		surface.addEventListener("pointerleave", handlePointerLeave);
		media.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			observer.disconnect();
			surface.removeEventListener("pointermove", handlePointerMove);
			surface.removeEventListener("pointerleave", handlePointerLeave);
			media.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			for (const drift of drifts) drift.cancel();
			stopImpacts();
		};
	}, [active]);
	return (
		<>
			<span ref={ref} aria-hidden="true" className="ticket-glimmer" data-active={active}>
				<span className="ticket-glimmer-flow">
					<span className="ticket-glimmer-film" data-layer="wash" />
					<span className="ticket-glimmer-film" data-layer="bubble" />
					<span className="ticket-glimmer-film" data-layer="ripple" />
				</span>
				<span className="ticket-glimmer-impact" />
				<span className="ticket-glimmer-impact" />
				<span className="ticket-glimmer-impact" />
				<span className="ticket-glimmer-impact" />
				<span className="ticket-glimmer-impact" />
			</span>
			{active && <span className="sr-only">Agent working</span>}
		</>
	);
}

function createDrifts(node: HTMLSpanElement): DriftControl[] {
	return Array.from(node.querySelectorAll<HTMLElement>(".ticket-glimmer-film"), (layer, index) => {
		let animation: MotionControl | null = null;
		let paused = false;
		let canceled = false;
		const advance = () => {
			if (canceled) return;
			animation = animate(
				layer,
				{ transform: transformFrame(index) },
				{
					duration: 4.5 + index + Math.random() * 4.5,
					ease: [0.42, 0, 0.25, 1],
					onComplete: advance,
				},
			);
			if (paused) animation.pause();
		};
		advance();
		return {
			play: () => {
				paused = false;
				animation?.play();
			},
			pause: () => {
				paused = true;
				animation?.pause();
			},
			cancel: () => {
				canceled = true;
				animation?.stop();
				animation = null;
			},
		};
	});
}

function createImpactBursts(node: HTMLSpanElement) {
	const impactNodes = Array.from(node.querySelectorAll<HTMLElement>(".ticket-glimmer-impact"));
	const animations: (MotionControl | undefined)[] = [];
	let active = true;
	let timer = 0;
	let previousIndex = Math.floor(Math.random() * impactNodes.length);
	const trigger = (x: number, y: number, motion: ImpactMotion) => {
		const index = (previousIndex + 1 + Math.floor(Math.random() * (impactNodes.length - 1))) % impactNodes.length;
		previousIndex = index;
		const impact = impactNodes[index]!;
		const skew = Math.random() * 18 - 9;
		const stretchX = 1.1 + motion.intensity * 1.25;
		const stretchY = 0.72 - motion.intensity * 0.22;
		const duration = 0.94 - motion.intensity * 0.26 + Math.random() * 0.18;
		const peakOpacity = 0.6 + motion.intensity * 0.38;
		impact.style.left = `${x}%`;
		impact.style.top = `${y}%`;
		impact.style.width = `${44 + motion.intensity * 46 + Math.random() * 10}%`;
		impact.style.aspectRatio = `${1.3 + motion.intensity * 1.8 + Math.random() * 0.5}`;
		impact.style.setProperty("--impact-hue", `${Math.random() * 80 - 40}deg`);
		animations[index]?.cancel();
		animations[index] = animate(
			impact,
			{
				opacity: [0, peakOpacity, peakOpacity * 0.7, 0],
				transform: [
					`translate3d(-50%, -50%, 0) translate3d(${-motion.trailX * 0.55}px, ${-motion.trailY * 0.55}px, 0) rotate(${motion.angle}deg) skewX(${skew}deg) scale(${stretchX * 0.14}, ${stretchY * 0.16})`,
					`translate3d(-50%, -50%, 0) translate3d(${-motion.trailX * 0.18}px, ${-motion.trailY * 0.18}px, 0) rotate(${motion.angle + 2}deg) skewX(${skew * 0.45}deg) scale(${stretchX * 0.52}, ${stretchY * 0.74})`,
					`translate3d(-50%, -50%, 0) translate3d(${motion.trailX * 0.38}px, ${motion.trailY * 0.38}px, 0) rotate(${motion.angle + 5}deg) skewX(${-skew * 0.4}deg) scale(${stretchX}, ${stretchY})`,
					`translate3d(-50%, -50%, 0) translate3d(${motion.trailX * 0.72}px, ${motion.trailY * 0.72}px, 0) rotate(${motion.angle + 9}deg) skewX(${-skew}deg) scale(${stretchX * 1.28}, ${stretchY * 1.18})`,
				],
			},
			{ duration, times: [0, 0.12, 0.5, 1], ease: "easeOut" },
		);
	};
	const schedule = (initial: boolean) => {
		const delay = initial ? 250 + Math.random() * 1200 : Math.min(7500, 260 - Math.log(1 - Math.random()) * 1900);
		timer = window.setTimeout(() => {
			if (!active) return;
			const angle = Math.random() * 360;
			const trailDistance = 10 + Math.random() * 12;
			trigger(2 + Math.random() * 96, 4 + Math.random() * 92, {
				angle,
				trailX: Math.cos((angle * Math.PI) / 180) * trailDistance,
				trailY: Math.sin((angle * Math.PI) / 180) * trailDistance,
				intensity: 0.45 + Math.random() * 0.3,
			});
			schedule(false);
		}, delay);
	};
	schedule(true);
	return {
		trigger,
		cancel: () => {
			active = false;
			window.clearTimeout(timer);
			for (const animation of animations) animation?.cancel();
		},
	};
}

function transformFrame(layer: number) {
	const reach = 6 + layer * 3;
	const x = ((Math.random() * 2 - 1) * reach).toFixed(2);
	const y = ((Math.random() * 2 - 1) * reach).toFixed(2);
	const rotation = ((Math.random() * 2 - 1) * (12 + layer * 5)).toFixed(2);
	const scale = (0.94 + Math.random() * 0.18).toFixed(3);
	return `translate3d(${x}%, ${y}%, 0) rotate(${rotation}deg) scale(${scale})`;
}
