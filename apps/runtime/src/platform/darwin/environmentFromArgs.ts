// KERN_PROCARGS2 returns argc, the executable path, argv, and then the environment.
// Match environment entries only; a command argument can contain the same text.
export function environmentFromArgs(data: Buffer): string[] {
	const argc = data.readInt32LE(0);
	let offset = data.indexOf(0, 4) + 1;
	while (offset < data.length && data[offset] === 0) offset++;
	for (let index = 0; index < argc; index++) {
		const end = data.indexOf(0, offset);
		if (end < 0) throw new Error("The process argument list is incomplete");
		offset = end + 1;
	}
	return data.subarray(offset).toString().split("\0").filter(Boolean);
}
