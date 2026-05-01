// web-ext-config.cjs
const os = require("os");
const path = require("path");

function thunderbirdBinary() {
  if (process.env.WEB_EXT_FIREFOX) return process.env.WEB_EXT_FIREFOX;
  switch (process.platform) {
    case "darwin":
      return "/Applications/Thunderbird Beta.app/Contents/MacOS/thunderbird";
    case "linux":
      return "/usr/bin/thunderbird"; // adjust to your install
    case "win32":
      return "C:\\Program Files\\Mozilla Thunderbird\\thunderbird.exe";
    default:
      throw new Error("Unsupported platform: " + process.platform);
  }
}

module.exports = {
  sourceDir: "./src",
  artifactsDir: "./web-ext-artifacts",
  run: {
    firefox: thunderbirdBinary(),
    firefoxProfile: path.join(os.homedir(), ".thunderbird-dev-profile"),
    profileCreateIfMissing: true,
    keepProfileChanges: true,
    browserConsole: true,
  },
  ignoreFiles: ["package-lock.json", "web-ext-config.cjs", "*.md"],
};
