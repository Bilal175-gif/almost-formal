import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (!resolved.url.endsWith(".wasm")) return resolved;

    const encoded = readFileSync(fileURLToPath(resolved.url)).toString("base64");
    const source = `export default new WebAssembly.Module(Uint8Array.from(atob("${encoded}"), c => c.charCodeAt(0)));`;
    return {
      url: `data:text/javascript,${encodeURIComponent(source)}`,
      shortCircuit: true,
    };
  },
});
