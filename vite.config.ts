import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const manualChunkGroups: Record<string, string[]> = {
  "supabase-vendor": ["@supabase/"],
  "motion-vendor": ["framer-motion", "motion-dom"],
  "router-vendor": ["react-router", "@remix-run/router"],
  // @react-pdf packages have circular module initialization across their
  // internals and font/image helpers. Keep the ecosystem together so Rollup
  // does not create TDZ crashes between vendor chunks in production.
  "pdf-vendor": [
    "@react-pdf/",
    "fontkit",
    "restructure",
    "pako",
    "brotli",
    "fflate",
    "@noble/ciphers",
    "js-md5",
    "jay-peg",
    "png-js",
    "events",
    "postcss-value-parser",
    "yoga-layout",
    "hyphen",
    "linebreak",
    "bidi-js",
    "unicode-properties",
  ],
};

const getManualChunk = (id: string) => {
  if (!id.includes("node_modules")) return undefined;

  for (const [chunkName, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((pkg) => id.includes(`/node_modules/${pkg}`) || id.includes(`node_modules/${pkg}`))) {
      return chunkName;
    }
  }

  return undefined;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
}));
