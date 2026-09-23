import { animate } from "motion/mini";
import { type CSSProperties, useEffect, useId, useLayoutEffect, useRef } from "react";

type MotionControl = ReturnType<typeof animate>;

type DriftControl = {
	play: () => void;
	pause: () => void;
	cancel: () => void;
};

// The coloured layer a ticket card draws while an agent works on it. Give the
// parent element `ticketCardFrame`: it sets `--glimmer-radius`, and this layer
// reads that value for its corner.
export function TicketGlimmer({ active }: { active: boolean }) {
	const ref = useRef<HTMLSpanElement>(null);
	const id = useId();
	useLayoutEffect(() => {
		const node = ref.current!;
		prepareTransition(node);
		node.dataset.active = String(active);
	}, [active]);
	useEffect(() => {
		if (!active) return;
		const node = ref.current!;
		const surface = node.parentElement!;
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		const wake = node.querySelector<HTMLElement>(".ticket-glimmer-wake")!;
		let settleTimer = 0;
		let drifts: DriftControl[] = [];
		let impacts: ReturnType<typeof createImpactBursts> | null = null;
		const stopImpacts = () => {
			impacts?.cancel();
			impacts = null;
		};
		const settlePointer = () => {
			window.clearTimeout(settleTimer);
			wake.dataset.moving = "false";
		};
		const sync = () => {
			if (media.matches) {
				settlePointer();
				for (const drift of drifts) drift.cancel();
				drifts = [];
				stopImpacts();
				return;
			}
			if (!visible || document.hidden) {
				settlePointer();
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
			if (!visible || document.hidden || media.matches || event.pointerType === "touch") return;
			const bounds = node.getBoundingClientRect();
			wake.style.transform = `translate3d(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px, 0) translate(-50%, -50%)`;
			wake.dataset.moving = "true";
			window.clearTimeout(settleTimer);
			settleTimer = window.setTimeout(settlePointer, 700);
		};
		observer.observe(node);
		surface.addEventListener("pointermove", handlePointerMove);
		surface.addEventListener("pointerenter", handlePointerMove);
		media.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			observer.disconnect();
			surface.removeEventListener("pointermove", handlePointerMove);
			surface.removeEventListener("pointerenter", handlePointerMove);
			settlePointer();
			media.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			for (const drift of drifts) drift.cancel();
			stopImpacts();
		};
	}, [active]);
	return (
		<>
			<span ref={ref} aria-hidden="true" className="ticket-glimmer">
				<span className="ticket-glimmer-flow">
					<span className="ticket-glimmer-film" data-layer="wash" style={filmStyle(id, 0)} />
					<span className="ticket-glimmer-film" data-layer="bubble" style={filmStyle(id, 1)} />
					<span className="ticket-glimmer-film" data-layer="ripple" style={filmStyle(id, 2)} />
				</span>
				<span className="ticket-glimmer-impact" />
				<span className="ticket-glimmer-wake" />
			</span>
			{active && <span className="sr-only">Agent working</span>}
		</>
	);
}

function prepareTransition(node: HTMLSpanElement) {
	const hidden = getComputedStyle(node).opacity === "0";
	if (hidden) {
		const patches = Array.from({ length: 18 + Math.floor(Math.random() * 15) }, (_, index) => {
			const opacity = `var(--glimmer-vapor-${(index % 8) + 1})`;
			const width = 12 + Math.random() * 36;
			const height = 20 + Math.random() * 65;
			const x = -10 + Math.random() * 120;
			const y = -10 + Math.random() * 120;
			const shoulder = 10 + Math.random() * 20;
			const edge = 55 + Math.random() * 35;
			return `radial-gradient(ellipse ${width}% ${height}% at ${x}% ${y}%, rgb(0 0 0 / ${opacity}) 0%, rgb(0 0 0 / calc(${opacity} * 0.65)) ${shoulder}%, transparent ${edge}%)`;
		});
		node.style.maskImage = patches.join(", ");
	}
	for (let index = 1; index <= 8; index++) {
		node.style.setProperty(`--glimmer-speed-${index}`, String(1 + Math.random() * 0.65));
		node.style.setProperty(`--glimmer-delay-${index}`, String(Math.random() * 0.3));
		node.style.setProperty(
			`--glimmer-ease-${index}`,
			`cubic-bezier(${0.2 + Math.random() * 0.2}, 0, ${0.4 + Math.random() * 0.4}, 1)`,
		);
	}
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
	const impact = node.querySelector<HTMLElement>(".ticket-glimmer-impact")!;
	let animation: MotionControl | null = null;
	let timer = 0;
	const schedule = () => {
		timer = window.setTimeout(
			() => {
				impact.style.left = `${10 + Math.random() * 80}%`;
				impact.style.top = `${10 + Math.random() * 80}%`;
				impact.style.width = `${35 + Math.random() * 20}%`;
				animation = animate(
					impact,
					{
						opacity: [0, 0.3, 0.2, 0],
						transform: [
							"translate(-50%, -50%) scale(0.8)",
							"translate(-50%, -50%) scale(0.95)",
							"translate(-50%, -50%) scale(1.05)",
							"translate(-50%, -50%) scale(1.2)",
						],
					},
					{ duration: 12 + Math.random() * 4, times: [0, 0.4, 0.65, 1], ease: "easeInOut" },
				);
				schedule();
			},
			18000 + Math.random() * 27000,
		);
	};
	schedule();
	return {
		cancel: () => {
			window.clearTimeout(timer);
			animation?.cancel();
		},
	};
}

function filmStyle(id: string, layer: number): CSSProperties {
	let seed = 2166136261;
	for (const char of `${id}:${layer}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
	seed ^= seed >>> 16;
	seed = Math.imul(seed, 0x45d9f3b);
	seed ^= seed >>> 16;
	return {
		"--film-x": `${(seed & 255) / 7 - 18}%`,
		"--film-y": `${((seed >>> 8) & 255) / 7 - 18}%`,
		scale: `${seed & 256 ? -1 : 1} ${seed & 512 ? -1 : 1}`,
	} as CSSProperties;
}

function transformFrame(layer: number) {
	const reach = 6 + layer * 3;
	const x = ((Math.random() * 2 - 1) * reach).toFixed(2);
	const y = ((Math.random() * 2 - 1) * reach).toFixed(2);
	const rotation = ((Math.random() * 2 - 1) * (12 + layer * 5)).toFixed(2);
	const scale = (0.94 + Math.random() * 0.18).toFixed(3);
	return `translate3d(${x}%, ${y}%, 0) rotate(${rotation}deg) scale(${scale})`;
}
