import { expect, test } from "bun:test";
import { canonicalJson } from "./canonicalJson";

test("sorts nested keys without rounding database numbers or changing array order", () => {
	const input = '{"z":[3,2,1],"a":{"2":9007199254740993,"10":12345678901234567890.123456789}}';
	expect(canonicalJson(input)).toBe('{"a":{"10":12345678901234567890.123456789,"2":9007199254740993},"z":[3,2,1]}');
});

test("preserves the value of original byte strings and sorts UTF-8 keys", () => {
	const requestBytes = ' { "grant": "é", "array": [2, 1] }\r\n';
	const input = JSON.stringify({ "😀": false, é: null, a: { requestBytes, empty: [] } });
	const result = canonicalJson(input);
	expect(result).toBe(`{"a":{"empty":[],"requestBytes":${JSON.stringify(requestBytes)}},"é":null,"😀":false}`);
	expect(JSON.parse(result).a.requestBytes).toBe(requestBytes);
});
