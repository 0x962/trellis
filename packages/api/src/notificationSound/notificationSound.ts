export const defaultNotifications = { sound: true, native: true, volume: 100 };

export function notificationSound(): Uint8Array {
	const rate = 22050;
	const samples = Math.floor(rate * 0.36);
	const bytes = new Uint8Array(44 + samples * 2);
	const view = new DataView(bytes.buffer);
	const text = (offset: number, value: string) =>
		[...value].forEach((char, index) => {
			view.setUint8(offset + index, char.charCodeAt(0));
		});
	text(0, "RIFF");
	view.setUint32(4, bytes.length - 8, true);
	text(8, "WAVE");
	text(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, samples * 2, true);
	for (let index = 0; index < samples; index++) {
		const time = index / rate;
		const envelope = Math.min(time / 0.015, 1) * Math.exp(-time * 12) * Math.min((0.36 - time) / 0.04, 1);
		const tone = Math.sin(2 * Math.PI * 660 * time) + 0.4 * Math.sin(2 * Math.PI * 880 * time);
		view.setInt16(44 + index * 2, Math.round(tone * envelope * 10000), true);
	}
	return bytes;
}
