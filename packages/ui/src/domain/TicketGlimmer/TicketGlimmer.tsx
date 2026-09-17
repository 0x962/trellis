import { animate } from "motion/mini";
import { useEffect, useRef } from "react";

export function TicketGlimmer({ active }: { active: boolean }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (!active) return;
		const node = ref.current!;
		const media = matchMedia("(prefers-reduced-motion: reduce)");
		let visible = false;
		let loop: ReturnType<typeof animate> | undefined;
		const sync = () => {
			if (media.matches) {
				loop?.cancel();
				loop = undefined;
				return;
			}
			if (!visible || document.hidden) {
				loop?.pause();
				return;
			}
			loop ??= animate(
				node,
				{ transform: ["translateX(-110%)", "translateX(110%)"] },
				{ duration: 3, repeat: Infinity, ease: "easeInOut" },
			);
			loop.play();
		};
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry!.isIntersecting;
			sync();
		});
		observer.observe(node.parentElement!);
		media.addEventListener("change", sync);
		document.addEventListener("visibilitychange", sync);
		return () => {
			observer.disconnect();
			media.removeEventListener("change", sync);
			document.removeEventListener("visibilitychange", sync);
			loop?.cancel();
		};
	}, [active]);
	if (!active) return null;
	return (
		<>
			<span aria-hidden="true" className="ticket-glimmer">
				<span ref={ref} className="ticket-glimmer-film" />
			</span>
			<span className="sr-only">Agent working</span>
		</>
	);
}
