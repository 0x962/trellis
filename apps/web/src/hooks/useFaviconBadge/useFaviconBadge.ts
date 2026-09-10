import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { needsYouCount } from "../../features/needs-you/utils/needsYouCount";
import { useApp } from "../../lib/appContext";

// What the badge prints: the count up to 9, and a bare dot above 9. No
// badge at 0.
export const badgeLabel = (count: number): string | null => {
	if (count === 0) return null;
	return count > 9 ? "" : String(count);
};

// The four strokes of the trellis mark on its 32 px grid, as TrellisMark
// draws them.
const strokes: Array<[number, number, number, number]> = [
	[13, 8, 24, 19],
	[8, 13, 19, 24],
	[8, 19, 19, 8],
	[13, 24, 24, 13],
];

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Draws the mark with the badge in its top right corner, as a PNG data URL.
// The colors are the palette tokens, so the badge follows the palette.
const drawBadge = (label: string): string => {
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 32;
	const context = canvas.getContext("2d")!;
	context.fillStyle = token("--mark");
	context.beginPath();
	context.roundRect(0, 0, 32, 32, 7);
	context.fill();
	context.strokeStyle = token("--accent");
	context.lineWidth = 2.5;
	context.lineCap = "round";
	for (const [x1, y1, x2, y2] of strokes) {
		context.beginPath();
		context.moveTo(x1, y1);
		context.lineTo(x2, y2);
		context.stroke();
	}
	context.fillStyle = token("--danger");
	context.beginPath();
	context.arc(label === "" ? 26 : 23, label === "" ? 6 : 9, label === "" ? 6 : 9, 0, Math.PI * 2);
	context.fill();
	if (label !== "") {
		context.fillStyle = token("--on-accent");
		context.font = `600 13px ${token("--sans")}`;
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.fillText(label, 23, 10);
	}
	return canvas.toDataURL("image/png");
};

// Puts the Needs you count on the tab icon, from the same inbox query as
// the sidebar badge. The SVG icon link keeps its own href in data
// attributes, so a count of 0 puts the plain mark back.
export const useFaviconBadge = (enabled: boolean) => {
	const { orpc } = useApp();
	const inbox = useQuery({ ...orpc.inbox.get.queryOptions({ input: {} }), enabled });
	const label = inbox.data === undefined ? null : badgeLabel(needsYouCount(inbox.data));

	useEffect(() => {
		const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
		if (link === null) return;
		link.dataset.plainHref ??= link.getAttribute("href") ?? "";
		link.dataset.plainType ??= link.type;
		if (label === null) {
			link.href = link.dataset.plainHref;
			link.type = link.dataset.plainType;
			return;
		}
		link.href = drawBadge(label);
		link.type = "image/png";
	}, [label]);
};
