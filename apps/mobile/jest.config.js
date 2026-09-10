// The component suite. Bun runs every *.test.ts; jest-expo runs every
// *.test.tsx, because bun cannot load react-native.
const preset = require("jest-expo/jest-preset");

// These packages ship untranspiled source, so babel transforms them. The
// list is jest-expo's own plus NativeWind, its runtime, oRPC, FlashList,
// rou3, the ESM-only router the fake server's OpenAPI handler loads, and the
// markdown renderer, whose build keeps its JSX.
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
	"@orpc",
	"@shopify/flash-list",
	"rou3",
	"@ronradtke/react-native-markdown-display",
];

// oRPC ships ESM in `.mjs` files only. Jest without `--experimental-vm-modules`
// loads every file as CommonJS, so babel-jest also has to see `.mjs` files.
const { "\\.[jt]sx?$": babel, ...transform } = preset.transform;

module.exports = {
	preset: "jest-expo",
	testMatch: ["<rootDir>/app/**/*.test.tsx", "<rootDir>/src/**/*.test.tsx"],
	transform: { ...transform, "\\.m?[jt]sx?$": babel },
	transformIgnorePatterns: [
		`/node_modules/(?!(${transformed.join("|")}))`,
		"/node_modules/react-native-reanimated/plugin/",
		"/node_modules/@react-native/babel-preset/",
	],
	moduleNameMapper: {
		"^react-native-mmkv$": "<rootDir>/test/mocks/react-native-mmkv.ts",
		"^react-native-sse$": "<rootDir>/test/mocks/react-native-sse.ts",
	},
	// FlashList measures its box through native layout calls. The package's
	// own jest setup answers them with a 400 by 900 box, so rows render.
	setupFiles: [...preset.setupFiles, require.resolve("@shopify/flash-list/jestSetup")],
	setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
	// expo-router's renderRouter turns on fake timers. With this option those
	// timers advance with the clock, so a real wait inside a test still ends.
	fakeTimers: { advanceTimers: true },
};
