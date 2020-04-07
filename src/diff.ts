import { Change, diffChars } from "diff";

export const enum FragmentKind {
  Same = 0,
  Added = 1,
  Removed = 2,
}

export type Fragment
  = { kind: FragmentKind.Added, contents: string }
  | { kind: FragmentKind.Removed, length: number }
  | { kind: FragmentKind.Same, length: number };

export const computeDiff = (oldStr: string, newStr: string) =>
  diffChars(oldStr, newStr).map((x: Change): Fragment => {
    if (x.added) return { kind: FragmentKind.Added, contents: x.value };
    if (x.removed) return { kind: FragmentKind.Removed, length: x.value.length };
    return { kind: FragmentKind.Same, length: x.value.length };
  });
