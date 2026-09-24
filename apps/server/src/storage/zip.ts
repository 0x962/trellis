// A zip file of stored entries. Trellis writes one for the download of a
// page version, so a person and the CLI both unpack it with ordinary tools.
//
// Every entry keeps its bytes as they are. The writer never buffers a whole
// file, so a 100 MiB asset costs no memory. The size of an entry is known
// before its bytes, and its CRC is not, so each entry sets the third general
// purpose flag and writes a data descriptor after its bytes. The central
// directory at the end repeats the same values.
//
// A page version holds at most 200 assets, 100 MiB for one file, and 250 MiB
// in total. Each of those is under the 4 GiB and 65535 entry limits of the
// plain format, so no entry needs a zip64 record.

export type ArchiveEntry = {
	path: string;
	open: () => ReadableStream<Uint8Array>;
};

const LOCAL_SIGNATURE = 0x04034b50;
const DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
// The third flag says the sizes and the CRC follow the bytes. The eleventh
// says the name is UTF-8.
const FLAGS = 0x0008 | 0x0800;
const STORED = 0;
const VERSION_NEEDED = 20;

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		table[index] = value >>> 0;
	}
	return table;
})();

const updateCrc = (crc: number, chunk: Uint8Array) => {
	let value = crc;
	for (const byte of chunk) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
	return value >>> 0;
};

const bytes = (length: number) => {
	const buffer = new Uint8Array(length);
	return { buffer, view: new DataView(buffer.buffer) };
};

// Every zip number is little endian.
const localHeader = (name: Uint8Array) => {
	const { buffer, view } = bytes(30 + name.length);
	view.setUint32(0, LOCAL_SIGNATURE, true);
	view.setUint16(4, VERSION_NEEDED, true);
	view.setUint16(6, FLAGS, true);
	view.setUint16(8, STORED, true);
	view.setUint16(26, name.length, true);
	buffer.set(name, 30);
	return buffer;
};

const dataDescriptor = (crc: number, size: number) => {
	const { buffer, view } = bytes(16);
	view.setUint32(0, DESCRIPTOR_SIGNATURE, true);
	view.setUint32(4, crc, true);
	view.setUint32(8, size, true);
	view.setUint32(12, size, true);
	return buffer;
};

type Written = { name: Uint8Array; crc: number; size: number; offset: number };

const centralEntry = (entry: Written) => {
	const { buffer, view } = bytes(46 + entry.name.length);
	view.setUint32(0, CENTRAL_SIGNATURE, true);
	view.setUint16(4, VERSION_NEEDED, true);
	view.setUint16(6, VERSION_NEEDED, true);
	view.setUint16(8, FLAGS, true);
	view.setUint16(10, STORED, true);
	view.setUint32(16, entry.crc, true);
	view.setUint32(20, entry.size, true);
	view.setUint32(24, entry.size, true);
	view.setUint16(28, entry.name.length, true);
	view.setUint32(42, entry.offset, true);
	buffer.set(entry.name, 46);
	return buffer;
};

const endRecord = (count: number, directorySize: number, directoryOffset: number) => {
	const { buffer, view } = bytes(22);
	view.setUint32(0, END_SIGNATURE, true);
	view.setUint16(8, count, true);
	view.setUint16(10, count, true);
	view.setUint32(12, directorySize, true);
	view.setUint32(16, directoryOffset, true);
	return buffer;
};

// The bytes of the archive, in order. The caller reads one chunk at a time,
// so the writer holds one chunk of one file at a time.
export async function* zipChunks(entries: ArchiveEntry[]): AsyncGenerator<Uint8Array> {
	const encoder = new TextEncoder();
	let offset = 0;
	const written: Written[] = [];
	for (const entry of entries) {
		const name = encoder.encode(entry.path);
		const start = offset;
		const header = localHeader(name);
		offset += header.length;
		yield header;
		let crc = 0xffffffff;
		let size = 0;
		for await (const chunk of entry.open()) {
			crc = updateCrc(crc, chunk);
			size += chunk.length;
			offset += chunk.length;
			yield chunk;
		}
		crc = (crc ^ 0xffffffff) >>> 0;
		const descriptor = dataDescriptor(crc, size);
		offset += descriptor.length;
		yield descriptor;
		written.push({ name, crc, size, offset: start });
	}
	const directoryOffset = offset;
	for (const entry of written) {
		const central = centralEntry(entry);
		offset += central.length;
		yield central;
	}
	yield endRecord(written.length, offset - directoryOffset, directoryOffset);
}

export const zipStream = (entries: ArchiveEntry[]): ReadableStream<Uint8Array> => {
	const chunks = zipChunks(entries);
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			const next = await chunks.next();
			if (next.done === true) controller.close();
			else controller.enqueue(next.value);
		},
	});
};
