// Implementation, hidden in a subfolder: not reachable from outside the
// package (enforced by dependency-cruiser). Free to be as large as it needs.
export function greetImpl(name: string): string {
  return `Hello, ${name}!`;
}
