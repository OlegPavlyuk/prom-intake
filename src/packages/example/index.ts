// Entry point (public surface). Import this from outside the package.
// It delegates to an internal file so the package is visibly *deep* - a small
// interface over a hidden implementation - rather than a pass-through barrel.
// This package is a copy-me template; delete it once real packages exist.
import { greetImpl } from "./lib/impl.js";

export function greet(name: string): string {
  return greetImpl(name);
}
