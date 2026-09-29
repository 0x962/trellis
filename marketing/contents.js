const sectionLinks = [...document.querySelectorAll(".contents-rail nav a")];
const sectionTargets = sectionLinks.map((link) => document.querySelector(link.getAttribute("href")));
function markSection() {
	const current =
		sectionTargets.filter((section) => section.getBoundingClientRect().top <= 180).at(-1) || sectionTargets[0];
	sectionLinks.forEach((link) => {
		if (link.getAttribute("href") === "#" + current.id) link.setAttribute("aria-current", "location");
		else link.removeAttribute("aria-current");
	});
}
window.addEventListener("scroll", markSection, { passive: true });
markSection();
