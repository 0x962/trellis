const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export function pairedPaxHeader(bytes: Buffer) {
	const values = new Map<string, string>();
	let offset = 0;
	while (offset < bytes.length) {
		const space = bytes.indexOf(32, offset);
		if (space < 0) throw new Error("paired_archive_invalid_pax");
		const digits = bytes.subarray(offset, space).toString("latin1");
		if (!/^[1-9][0-9]*$/.test(digits)) throw new Error("paired_archive_invalid_pax");
		const size = Number(digits);
		if (!Number.isSafeInteger(size) || size <= space - offset + 1 || size > bytes.length - offset)
			throw new Error("paired_archive_invalid_pax");
		const end = offset + size;
		if (bytes[end - 1] !== 10) throw new Error("paired_archive_invalid_pax");
		const record = decode(bytes.subarray(space + 1, end - 1));
		const equal = record.indexOf("=");
		if (equal < 1) throw new Error("paired_archive_invalid_pax");
		const key = record.slice(0, equal);
		if (!new Set(["path", "size", "mtime", "atime", "ctime", "uid", "gid", "uname", "gname", "LIBARCHIVE.creationtime"]).has(key))
			throw new Error("paired_archive_unsupported_pax");
		if (values.has(key)) throw new Error("paired_archive_duplicate_pax");
		values.set(key, record.slice(equal + 1));
		offset = end;
	}
	const size = values.get("size");
	if (size !== undefined && (!/^(0|[1-9][0-9]*)$/.test(size) || !Number.isSafeInteger(Number(size))))
		throw new Error("paired_archive_invalid_pax_size");
	return { path: values.get("path"), size: size === undefined ? undefined : Number(size) };
}
