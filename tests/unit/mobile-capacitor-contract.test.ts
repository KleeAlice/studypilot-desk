import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("configures a Capacitor 8 Android application around the mobile bundle", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const config = readFileSync("capacitor.config.ts", "utf8");
  const variables = readFileSync("mobile/android/variables.gradle", "utf8");
  const manifest = readFileSync("mobile/android/app/src/main/AndroidManifest.xml", "utf8");

  expect(packageJson.dependencies["@capacitor/core"]).toMatch(/^\^8\./);
  expect(packageJson.dependencies["@capacitor/android"]).toMatch(/^\^8\./);
  expect(packageJson.devDependencies["@capacitor/cli"]).toMatch(/^\^8\./);
  expect(packageJson.scripts["mobile:sync"]).toContain("cap sync android");
  expect(packageJson.scripts["mobile:apk"]).toContain("assembleDebug");
  expect(config).toContain('appId: "app.studypilot.mobile"');
  expect(config).toContain('webDir: "dist-mobile"');
  expect(config).toContain('path: "mobile/android"');
  expect(variables).toContain("minSdkVersion = 28");
  expect(variables).toContain("compileSdkVersion = 36");
  expect(manifest).toContain('android:allowBackup="false"');
});
