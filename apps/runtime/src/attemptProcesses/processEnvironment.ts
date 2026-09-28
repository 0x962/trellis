import { constants } from "node:os";
import { errno, load } from "koffi";
import { processIdentity } from "../processIdentity";
import { environmentFromArgs } from "./environmentFromArgs.ts";

const library = load(null);
const sysctl = library.func(
	"int sysctl(int *name, unsigned int namelen, void *oldp, size_t *oldlenp, void *newp, size_t newlen)",
);

export function processEnvironmentReader() {
	const maximum = Buffer.alloc(4);
	const size = Buffer.alloc(8);
	size.writeBigUInt64LE(4n);
	if (sysctl(new Int32Array([1, 8]), 2, maximum, size, null, 0) !== 0)
		throw new Error(`Cannot read the process argument limit: errno ${errno()}`);
	const data = Buffer.alloc(maximum.readInt32LE(0));
	return (pid: number): { executable: string; environment: string[] } | null => {
		size.writeBigUInt64LE(BigInt(data.length));
		if (sysctl(new Int32Array([1, 49, pid]), 3, data, size, null, 0) !== 0) {
			const failure = errno();
			if (failure === constants.errno.ESRCH || processIdentity(pid).kind === "missing") return null;
			throw new Error(`Cannot inspect process ${pid}: errno ${failure}`);
		}
		const args = data.subarray(0, Number(size.readBigUInt64LE()));
		return { executable: args.subarray(4, args.indexOf(0, 4)).toString(), environment: environmentFromArgs(args) };
	};
}
