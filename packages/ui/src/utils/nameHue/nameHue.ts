// A hue in degrees for one name, the same on every render and every
// machine. FNV-1a over the UTF-16 units spreads similar names apart, so
// "Builder" and "Builder 2" do not share a color.
export const nameHue = (seed: string): number => {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index++) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash % 360;
};
