import type { CSSProperties } from "react";
import { cx } from "../../utils/cx";
import { confettiPieceMs, confettiPieces, confettiStepMs } from "./pieces";

export type CheckConfettiProps = { className?: string };

// Seven pieces of paper ribbon that arc out of a check bar, turn edge on,
// and drop. The caller mounts it for `confettiMs` and then removes it.
//
// The box fills its parent, and the parent is a 192 px by 12 px box over a
// `CheckRibbon` of size `wide`. A piece flies 19 px above the box and 22 px
// below it, so the parent must sit outside any box that clips: the pull
// request row of the epic table and `CheckRibbon` itself both set
// `overflow-hidden`.
//
// Each piece is two spans. The outer span drifts sideways at a steady rate.
// The inner span arcs up and falls, and it turns edge on at the top of the
// arc. Two animations on two elements is how one piece follows a curve with
// no script behind it.
//
// The person who asked the system for less motion sees nothing: the caller
// does not mount this.
export function CheckConfetti({ className }: CheckConfettiProps) {
	return (
		<span aria-hidden="true" className={cx("pointer-events-none absolute inset-0 block", className)}>
			{confettiPieces.map((piece, index) => (
				<span
					key={piece.x}
					data-confetti-piece=""
					style={
						{
							left: `${piece.x}px`,
							animationDelay: `${index * confettiStepMs}ms`,
							"--confetti-run": `${confettiPieceMs}ms`,
							"--confetti-across": `${piece.dx}px`,
						} as CSSProperties
					}
					className="absolute top-px block confetti-drift motion-reduce:animate-none"
				>
					<i
						style={
							{
								animationDelay: `${index * confettiStepMs}ms`,
								"--confetti-run": `${confettiPieceMs}ms`,
								"--confetti-turn": `${piece.turn}deg`,
								background: `var(${piece.ink})`,
							} as CSSProperties
						}
						className="block h-2 w-[3px] confetti-arc rounded-[1px] motion-reduce:animate-none"
					/>
				</span>
			))}
		</span>
	);
}
