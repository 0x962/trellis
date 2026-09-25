import { usageError } from "../../errors.ts";

const digits = /^[1-9][0-9]*$/;

// A revision or a version number from the command line. Every page number
// counts from one, so a value with a sign, a point, or a letter names no
// revision and ends the run before any request.
export const positiveInteger = (value: string | undefined, flag: string): number | undefined => {
	if (value === undefined) return undefined;
	if (!digits.test(value)) throw usageError(`${flag} needs a positive integer, not "${value}"`);
	return Number(value);
};
