// A 53 bit hash of the patch text of one file, written as hex.
//
// The review page marks a file read and stores this value. The next revision
// hashes the same file again. Any edit to the added lines, the deleted lines,
// the line numbers or the file mode gives a different value, so a rewrite that
// swaps one line for another line clears the mark. A hash, and not the text,
// keeps the stored mark small.
export function patchDigest(patch: string): string {
	let low = 0xdeadbeef;
	let high = 0x41c6ce57;
	for (let index = 0; index < patch.length; index += 1) {
		const code = patch.charCodeAt(index);
		low = Math.imul(low ^ code, 2654435761);
		high = Math.imul(high ^ code, 1597334677);
	}
	low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
	high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
	return (4294967296 * (2097151 & high) + (low >>> 0)).toString(16);
}
