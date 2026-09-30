const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const text = (bytes: Buffer) => {
	const end = bytes.indexOf(0);
	if (end === -1) return decode(bytes);
	if (bytes.subarray(end).some((value) => value !== 0)) throw new Error("paired_archive_invalid_header");
	return decode(bytes.subarray(0, end));
};

function number(bytes: Buffer) {
	let value: bigint;
	if ((bytes[0]! & 0x80) !== 0) {
		if ((bytes[0]! & 0x40) !== 0) throw new Error("paired_archive_negative_number");
		value = BigInt(bytes[0]! & 0x7f);
		for (const byte of bytes.subarray(1)) value = (value << 8n) | BigInt(byte);
	} else {
		const digits = decode(bytes).replace(/[\0 ]+$/g, "").trimStart();
		if (!/^[0-7]+$/.test(digits)) throw new Error("paired_archive_invalid_number");
		value = BigInt(`0o${digits}`);
	}
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("paired_archive_number_out_of_range");
	return Number(value);
}

export function pairedTarHeader(bytes: Buffer, extendedPath?: string) {
	const checksum = number(bytes.subarray(148, 156));
	const actual = bytes.reduce((sum, value, offset) => sum + (offset >= 148 && offset < 156 ? 32 : value), 0);
	if (checksum !== actual) throw new Error("paired_archive_checksum_mismatch");
	const magic = bytes.subarray(257, 263).toString("latin1");
	if (magic !== "ustar\0" && magic !== "ustar ") throw new Error("paired_archive_unsupported_format");
	const type = bytes[156] === 0 ? "0" : String.fromCharCode(bytes[156]!);
	let path = extendedPath;
	if (path === undefined && type !== "x" && type !== "L") {
		const prefix = magic === "ustar\0" ? text(bytes.subarray(345, 500)) : "";
		const name = text(bytes.subarray(0, 100));
		path = prefix ? `${prefix}/${name}` : name;
	}
	return {
		path: path ?? "",
		type,
		size: number(bytes.subarray(124, 136)),
		mode: number(bytes.subarray(100, 108)),
		link: text(bytes.subarray(157, 257)),
	};
}
