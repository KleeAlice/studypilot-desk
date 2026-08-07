import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.studypilot.mobile",
  appName: "StudyPilot",
  webDir: "dist-mobile",
  android: {
    path: "mobile/android",
    webContentsDebuggingEnabled: true,
  },
};

export default config;
