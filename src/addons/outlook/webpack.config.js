/* eslint-disable no-undef */

const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const htmlWebpackInjectAttributesPlugin = require("html-webpack-inject-attributes-plugin");

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const config = {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable", "regenerator-runtime/runtime"],
      taskpane: ["./src/taskpane/taskpane.js", "./src/taskpane/taskpane.html"],
      commands: "./src/commands/commands.js",
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
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane"],
        scriptLoading: "defer",
        attributes: {
          nonce: "NONCE_PLACEHOLDER",
        },
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          }
        ],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["polyfill", "commands"],
        scriptLoading: "defer",
        attributes: {
          nonce: "NONCE_PLACEHOLDER",
        },
      }),
      new HtmlWebpackPlugin({
        filename: "transit.html",
        template: "./src/transit/transit.html",
        chunks: ["polyfill", "transit"],
        scriptLoading: "defer",
        attributes: {
          nonce: "NONCE_PLACEHOLDER",
        },
      }),
      new HtmlWebpackPlugin({
        filename: "success.html",
        template: "./src/success/success.html",
        chunks: ["polyfill", "success"],
        scriptLoading: "defer",
        attributes: {
          nonce: "NONCE_PLACEHOLDER",
        },
      }),
      new htmlWebpackInjectAttributesPlugin(),
    ],
    devServer: {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: {
        type: "https",
        options:
          env.WEBPACK_BUILD || options.https !== undefined
            ? options.https
            : await getHttpsOptions(),
      },
      port: process.env.npm_package_config_dev_server_port || 3000,
    },
  };

  return config;
};