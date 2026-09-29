import { usageError } from "./errors.ts";

const digits = /^[1-9][0-9]*$/;

export const positiveInteger = (value: string | undefined, flag: string): number | undefined => {
	if (value === undefined) return undefined;
	if (!digits.test(value)) throw usageError(`${flag} needs a positive integer, not "${value}"`);
	return Number(value);
};
