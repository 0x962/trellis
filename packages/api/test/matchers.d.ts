// bun-types declares `toEqual(expected: T)` with T taken from the actual
// value. The fixtures in test/fixtures.ts are plain objects whose enum fields
// are typed `string`, so a comparison against a schema output (whose enum
// fields are literal unions) does not compile. These overloads give the two
// matchers Jest's parameter type. The runtime comparison is unchanged.
declare module "bun:test" {
	interface Matchers<T> {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
	}
}

export {};
