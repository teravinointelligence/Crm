// Resuelve imports relativos sin extensión a .ts (para correr lib/*.ts con node --strip-types).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) && !/\.[a-z]+$/i.test(specifier)) {
    const base = specifier.startsWith("/") ? specifier : fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of [".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, context);
  }
  if (specifier.startsWith("@/")) {
    const base = new URL("../../" + specifier.slice(2), import.meta.url).pathname;
    for (const ext of ["", ".ts", ".tsx", "/index.ts"]) if (existsSync(base + ext) && ext) return next(pathToFileURL(base + ext).href, context);
  }
  return next(specifier, context);
}
