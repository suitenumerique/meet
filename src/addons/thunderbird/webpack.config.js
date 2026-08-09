const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const htmlWebpackInjectAttributesPlugin = require("html-webpack-inject-attributes-plugin");

const DEFAULT_DEV_BASE_URL = "https://meet.127.0.0.1.nip.io";

module.exports = () => ({
  devtool: "source-map",
  entry: {
    background: "./src/background/background.js",
    transit: ["./src/transit/transit.js", "./src/transit/transit.html"],
    success: ["./src/success/success.js", "./src/success/success.html"],
  },
  output: {
    clean: true,
  },
  resolve: {
    extensions: [".html", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
      {
        test: /\.html$/,
        exclude: /node_modules/,
        use: {
          loader: "html-loader",
          options: {
            sources: {
              urlFilter: (attribute, value) => {
                // Don't try to resolve the runtime-injected config
                if (value.includes("config.js")) {
                  return false;
                }
                return true;
              },
            },
          },
        },
      },
      {
        test: /\.(png|jpg|jpeg|gif|ico)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/[name][ext][query]",
        },
      },
      {
        // Routed into assets/ so it's covered by the same nginx location
        // block as the icons (see frontend_nginx_cm.yaml) — content-hashed
        // filename so it can be cached aggressively.
        test: /\.css$/,
        type: "asset/resource",
        generator: {
          filename: "assets/[hash][ext]",
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "transit.html",
      template: "./src/transit/transit.html",
      chunks: ["transit"],
      scriptLoading: "defer",
      attributes: {
        nonce: "NONCE_PLACEHOLDER",
      },
    }),
    new HtmlWebpackPlugin({
      filename: "success.html",
      template: "./src/success/success.html",
      chunks: ["success"],
      scriptLoading: "defer",
      attributes: {
        nonce: "NONCE_PLACEHOLDER",
      },
    }),
    new htmlWebpackInjectAttributesPlugin(),
    new webpack.DefinePlugin({
      // Consumed only by the `background` entry (see src/common/index.js) —
      // baked in at build time since the packaged .xpi has no runtime config
      // endpoint to call before it knows which server to talk to.
      "process.env.THUNDERBIRD_BASE_URL": JSON.stringify(
        process.env.THUNDERBIRD_BASE_URL || DEFAULT_DEV_BASE_URL,
      ),
      "process.env.THUNDERBIRD_APP_NAME": JSON.stringify(
        process.env.THUNDERBIRD_APP_NAME || "LaSuite Meet",
      ),
      "process.env.THUNDERBIRD_ENABLE_SOURCE_TRACKING": JSON.stringify(
        process.env.THUNDERBIRD_ENABLE_SOURCE_TRACKING || "false",
      ),
      "process.env.THUNDERBIRD_FEEDBACK_FORM": JSON.stringify(
        process.env.THUNDERBIRD_FEEDBACK_FORM || "",
      ),
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "assets/*",
          to: "assets/[name][ext][query]",
        },
      ],
    }),
  ],
});
