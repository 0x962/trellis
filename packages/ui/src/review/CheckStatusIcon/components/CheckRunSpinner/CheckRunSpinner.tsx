import { DotFillIcon } from "@primer/octicons-react";
import { animate } from "motion/mini";
import { useEffect, useRef } from "react";
import { cx } from "../../../../utils/cx";

export function CheckRunSpinner({ className }: { className?: string }) {
	const ring = useRef<SVGSVGElement>(null);
	useEffect(() => {
		const node = ring.current!;
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
				{ transform: ["rotate(0deg)", "rotate(360deg)"] },
				{ duration: 1, repeat: Infinity, ease: "linear" },
			);
			loop.play();
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
			loop?.cancel();
		};
	}, []);
	return (
		<span
			aria-hidden="true"
			className={cx("relative inline-flex size-4 shrink-0 items-center justify-center text-warning", className)}
		>
			<svg
				ref={ring}
				aria-hidden="true"
				width="18"
				height="18"
				viewBox="0 0 18 18"
				fill="none"
				stroke="currentColor"
				className="absolute"
			>
				<g transform="translate(1 1)" strokeWidth="2">
					<circle opacity=".5" cx="8" cy="8" r="7" />
					<path d="M15 8A7 7 0 0 1 8 15" />
				</g>
			</svg>
			<DotFillIcon size={16} />
		</span>
	);
}
