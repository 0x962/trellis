import { motionPreference } from "./motionPreference.js";

const reveals = [];
const diagramControls = new Map();
Motion.inView(
	".capability",
	(element) => {
		if (motionPreference.matches) return;
		reveals.push(
			Motion.animate(
				element.querySelector(".mini-diagram"),
				{ opacity: [0.3, 1], y: [16, 0] },
				{ duration: 0.75, ease: [0.22, 1, 0.36, 1] },
			),
		);
		reveals.push(
			Motion.animate(
				element.querySelectorAll(".mini-diagram g > rect"),
				{ opacity: [0.2, 1] },
				{ duration: 0.6, delay: Motion.stagger(0.13) },
			),
		);
	},
	{ amount: 0.4 },
);
Motion.inView(
	".ticket-document, .review-workbench, .terminal",
	(element) => {
		if (motionPreference.matches) return;
		reveals.push(
			Motion.animate(element, { opacity: [0.55, 1], y: [14, 0] }, { duration: 0.7, ease: [0.22, 1, 0.36, 1] }),
		);
	},
	{ amount: 0.25 },
);
document.querySelectorAll(".capability").forEach((card) => {
	const drawing = card.querySelector(".mini-diagram svg");
	card.addEventListener("pointerenter", () => {
		if (motionPreference.matches) return;
		diagramControls.get(card)?.stop();
		diagramControls.set(
			card,
			Motion.animate(drawing, { y: -7, rotate: -2 }, { type: "spring", duration: 0.5, bounce: 0 }),
		);
	});
	card.addEventListener("pointerleave", () => {
		diagramControls.get(card)?.stop();
		diagramControls.set(
			card,
			Motion.animate(
				drawing,
				{ y: 0, rotate: 0 },
				{ duration: motionPreference.matches ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] },
			),
		);
	});
});
motionPreference.addEventListener("change", (event) => {
	if (!event.matches) return;
	reveals.forEach((control) => {
		control.complete();
	});
	diagramControls.forEach((control) => {
		control.complete();
	});
});
