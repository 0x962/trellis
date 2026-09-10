// bun-types declares `toEqual(expected: T)` with T taken from the actual
// value. The fixtures in test/fixtures.ts are plain objects whose enum fields
// are typed `string`. A schema output types the same fields as literal
// unions, so a comparison of the two does not compile. These overloads give
// the two matchers Jest's parameter type. The runtime comparison is unchanged.
declare module "bun:test" {
	interface Matchers<T> {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
	}
}

export {};
