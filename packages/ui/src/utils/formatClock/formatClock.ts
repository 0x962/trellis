// A duration as a clock reading: 0:07, 1:45, and 1:02:09 past an hour. The
// input rounds down to whole seconds and never below zero, so a browser
// clock a little behind the server still reads 0:00.
export const formatClock = (ms: number) => {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const pad = (value: number) => String(value).padStart(2, "0");
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};
