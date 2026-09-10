const png = new Uint8Array([
	137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0, 0, 0, 8, 4, 0, 0, 0, 0, 36, 148, 12, 86,
	0, 0, 0, 14, 73, 68, 65, 84, 8, 215, 99, 152, 9, 4, 12, 132, 9, 0, 126, 183, 19, 33, 159, 141, 57, 118, 0, 0, 0, 0,
	73, 69, 78, 68, 174, 66, 96, 130,
]);

export const seedAttachmentBytes = (mime: string, size: number): Uint8Array<ArrayBuffer> => {
	if (mime !== "image/png") return new TextEncoder().encode("a".repeat(size));
	const bytes = new Uint8Array(size);
	bytes.set(png);
	return bytes;
};
