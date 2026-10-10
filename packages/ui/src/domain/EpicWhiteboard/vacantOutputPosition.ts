type Bounds = { x: number; y: number; w: number; h: number };

export function vacantOutputPosition(preferred: Bounds, occupied: readonly Bounds[]) {
	const point = { x: preferred.x, y: preferred.y };
	for (const bounds of [...occupied].sort((left, right) => left.y - right.y)) {
		if (
			point.x < bounds.x + bounds.w + 24 &&
			point.x + preferred.w + 24 > bounds.x &&
			point.y < bounds.y + bounds.h + 24 &&
			point.y + preferred.h + 24 > bounds.y
		) {
			point.y = bounds.y + bounds.h + 24;
		}
	}
	return point;
}
