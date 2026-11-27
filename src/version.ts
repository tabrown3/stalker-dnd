// The app version. Keep in step with package.json and app.json (a test checks).
export const APP_VERSION = "0.1.0";

/** Short commit the web build was made from; "dev" for local runs. Set by CI. */
export const BUILD = (process.env.EXPO_PUBLIC_BUILD_SHA ?? "").slice(0, 7) || "dev";
