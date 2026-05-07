import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const manualChunkGroups: Record<string, string[]> = {
  "supabase-vendor": ["@supabase/"],
  "motion-vendor": ["framer-motion", "motion-dom"],
  "router-vendor": ["react-router", "@remix-run/router"],
  "pdfkit-vendor": ["@react-pdf/pdfkit"],
  "pdf-compression-vendor": ["pako", "brotli", "fflate", "@noble/ciphers", "js-md5"],
  "fontkit-vendor": ["fontkit", "restructure"],
  "pdf-reconciler-vendor": ["@react-pdf/reconciler", "@react-pdf/render"],
  "pdf-layout-vendor": ["@react-pdf/layout", "yoga-layout", "@react-pdf/stylesheet"],
  "pdf-text-vendor": ["@react-pdf/textkit", "hyphen", "linebreak", "bidi-js", "unicode-properties"],
  "pdf-assets-vendor": [
    "@react-pdf/image",
    "@react-pdf/font",
    "@react-pdf/primitives",
    "@react-pdf/fns",
    "jay-peg",
    "png-js",
    "events",
    "postcss-value-parser",
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
