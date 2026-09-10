// The component suite. Bun runs every *.test.ts; jest-expo runs every
// *.test.tsx, because bun cannot load react-native.
// These packages ship untranspiled source, so babel transforms them. The
// list is jest-expo's own plus NativeWind and its runtime.
const transformed = [
	"react-native",
	"@react-native",
	"@react-native-community",
	"expo",
	"@expo",
	"@expo-google-fonts",
	"react-navigation",
	"@react-navigation",
	"@sentry/react-native",
	"native-base",
	"standard-navigation",
	"nativewind",
	"react-native-css-interop",
];

module.exports = {
	preset: "jest-expo",
	testMatch: ["<rootDir>/app/**/*.test.tsx", "<rootDir>/src/**/*.test.tsx"],
	transformIgnorePatterns: [
		`/node_modules/(?!(${transformed.join("|")}))`,
		"/node_modules/react-native-reanimated/plugin/",
		"/node_modules/@react-native/babel-preset/",
	],
	moduleNameMapper: {
		"^react-native-mmkv$": "<rootDir>/test/mocks/react-native-mmkv.ts",
		"^react-native-sse$": "<rootDir>/test/mocks/react-native-sse.ts",
	},
	setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
};
