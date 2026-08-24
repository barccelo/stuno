import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
    }),
  ],
});
