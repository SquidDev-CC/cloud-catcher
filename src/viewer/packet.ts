export const fletcher32 = (contents: string) => {
  let s1 = 0;
  let s2 = 0;

  if (contents.length % 2 !== 0) contents += "\0";

  for (let i = 0; i < contents.length; i += 2) {
    const c1 = contents.charCodeAt(i);
    const c2 = contents.charCodeAt(i + 1);
    s1 = (s1 + c1 + (c2 << 8)) % 0xFFFF;
    s2 = (s1 + s2) % 0xFFFF;
  }
  return (s2 << 16 | s1) >>> 0;
};
