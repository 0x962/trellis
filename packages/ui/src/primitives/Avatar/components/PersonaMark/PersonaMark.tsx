const colors = ["text-accent", "text-agent", "text-success", "text-warning", "text-danger"] as const;
const shapes = [
	"M12 2 22 12 12 22 2 12Z",
	"M4 4H20V20H4Z",
	"M12 2 23 21H1Z",
	"M7 2H17L23 12 17 22H7L1 12Z",
	"M9 2H15V9H22V15H15V22H9V15H2V9H9Z",
] as const;

export function PersonaMark({ name }: { name: string }) {
	const key = name.trim().toLowerCase();
	let hash = 0;
	for (const character of key) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0;
	const index = key === "trellis" ? 0 : key === "builder" ? 1 : key === "reviewer" ? 2 : hash % shapes.length;
	const color =
		key === "trellis"
			? 0
			: key === "builder"
				? 1
				: key === "reviewer"
					? 2
					: Math.floor(hash / shapes.length) % colors.length;
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className={`size-full ${colors[color]}`} fill="currentColor">
			<path d={shapes[index]} />
		</svg>
	);
}
