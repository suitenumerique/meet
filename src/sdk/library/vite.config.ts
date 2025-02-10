import path, { resolve } from "path";

import react from "@vitejs/plugin-react-swc";
import { AliasOptions, defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({ tsconfigPath: "./tsconfig.app.json", rollupTypes: true }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    } as AliasOptions,
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      name: "visio-sdk",
      fileName: "visio-sdk",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    copyPublicDir: false,
  },
});
