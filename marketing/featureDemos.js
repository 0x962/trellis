import { motionPreference } from "./motionPreference.js";

const demoCopy = [
	[
		"The endpoint gives the interface a result to build on.",
		"The email form depends on the endpoint. The dependency stays with its ticket.",
	],
	[
		"The session keeps the instructions with the assignment.",
		"Inspect the files from the same session, beside the conversation.",
	],
	["The original code accepts a blank address.", "The proposed change rejects a blank address before it saves."],
	[
		"The correctness reviewer completed its assigned check.",
		"The coverage reviewer found a missing test for an address with only spaces.",
	],
	[
		"A project note keeps a shared decision available to agents.",
		"The API contract is a document resource attached to the epic.",
	],
	[
		"Version 1 shows the first workflow diagram.",
		"Version 2 adds the review step. The published page keeps the same link.",
	],
];
const featureCards = [...document.querySelectorAll(".capability")];
const demoSources = featureCards.map((card) => card.querySelector("svg").innerHTML);
function selectDemo(index, state, animate = true) {
	const card = featureCards[index],
		svg = card.querySelector("svg");
	svg.innerHTML = demoSources[index];
	const group = svg.querySelector("g");
	const texts = [...group.querySelectorAll("text")];
	const rects = [...group.querySelectorAll("rect")];
	if (index === 0)
		rects.forEach((rect, i) => {
			rect.setAttribute("fill", i === (state === 0 ? 1 : 2) ? "#a7d9c6" : "#fafaf5");
		});
	if (index === 1 && state === 1) {
		texts[0].textContent = "Files · ACM-12";
		texts[1].textContent = "account/email.ts";
		texts[2].textContent = "account/email.test.ts  +1 test";
	}
	if (index === 2) {
		const code =
			state === 0
				? ["12   const email = input.email;", "13   await save(email);", "14", "15"]
				: ["12   const email = input.email.trim();", "13 + if (!email) {", "14 +   return invalid();", "15 + }"];
		texts.slice(1).forEach((text, i) => {
			text.textContent = code[i];
		});
		rects.slice(1).forEach((rect) => {
			rect.setAttribute("fill", state === 0 ? "#edf0e9" : "#cee5dc");
		});
	}
	if (index === 3)
		rects.forEach((rect, i) => {
			rect.setAttribute("fill", i === (state === 0 ? 1 : 2) ? "#a7d9c6" : "#fafaf5");
		});
	if (index === 4)
		rects.forEach((rect, i) => {
			rect.setAttribute("fill", i === state ? "#a7d9c6" : "#fafaf5");
		});
	if (index === 5) {
		texts[1].textContent = state === 0 ? "v1 · Plan" : "v2 · Review";
		texts[2].textContent = state === 0 ? "Define → Assign" : "Define → Assign → Review";
		rects[1].setAttribute("width", state === 0 ? "61" : "126");
	}
	card.querySelectorAll("[data-state]").forEach((button) => {
		button.setAttribute("aria-pressed", String(Number(button.dataset.state) === state));
	});
	card.querySelector(".diagram-detail").textContent = demoCopy[index][state];
	if (animate && !motionPreference.matches)
		Motion.animate(svg, { opacity: [0.35, 1], y: [5, 0] }, { duration: 0.3, ease: "easeOut" });
}
document.querySelectorAll("[data-demo]").forEach((button) => {
	button.addEventListener("click", () => selectDemo(Number(button.dataset.demo), Number(button.dataset.state)));
});
featureCards.forEach((_card, index) => {
	selectDemo(index, 0, false);
});
