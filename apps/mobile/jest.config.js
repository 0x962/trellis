// The component suite. Bun runs every *.test.ts; jest-expo runs every
// *.test.tsx, because bun cannot load react-native.
const preset = require("jest-expo/jest-preset");

// These packages ship untranspiled source, so babel transforms them. The
// list is jest-expo's own plus NativeWind, its runtime, oRPC, FlashList, the
// ESM-only packages the typed client pulls in, and the markdown renderer,
// whose build keeps its JSX.
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
	"hono",
	"ulid",
	"@ronradtke/react-native-markdown-display",
];

// oRPC ships ESM in `.mjs` files only. Jest without `--experimental-vm-modules`
// loads every file as CommonJS, so babel-jest also has to see `.mjs` files.
const { "\\.[jt]sx?$": babel, ...transform } = preset.transform;

module.exports = {
	preset: "jest-expo",
	testMatch: ["<rootDir>/app/**/*.test.tsx", "<rootDir>/src/**/*.test.tsx"],
	// One server serves the whole run, and its inbox, its project list, and
	// its search span every project. So one file runs at a time, and each file
	// drops the projects of the file before it.
	globalSetup: "<rootDir>/test/globalSetup.ts",
	globalTeardown: "<rootDir>/test/globalTeardown.ts",
	maxWorkers: 1,
	testTimeout: 30_000,
	transform: { ...transform, "\\.m?[jt]sx?$": babel },
	transformIgnorePatterns: [
		`/node_modules/(?!(${transformed.join("|")}))`,
		"/node_modules/react-native-reanimated/plugin/",
		"/node_modules/@react-native/babel-preset/",
	],
	moduleNameMapper: {
		"^react-native-mmkv$": "<rootDir>/test/mocks/react-native-mmkv.ts",
		"^react-native-sse$": "<rootDir>/test/mocks/react-native-sse.ts",
		"^expo-haptics$": "<rootDir>/test/mocks/expo-haptics.ts",
		"^expo-camera$": "<rootDir>/test/mocks/expo-camera.tsx",
	},
	setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
};
