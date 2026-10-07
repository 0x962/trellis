export function niceMax(max: number) {
	if (max <= 0) return 1;
	const power = 10 ** Math.floor(Math.log10(max));
	const unit = max / power;
	const step = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 4 ? 4 : unit <= 5 ? 5 : 10;
	return step * power;
}
