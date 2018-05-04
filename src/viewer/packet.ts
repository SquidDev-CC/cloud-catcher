import { FileOpenFlags } from "../network";
import { TerminalData } from "./terminal/data";

export const decode10TerminalChanged = (packet: string, terminal: TerminalData) => {
  const info = packet.substr(0, 11);
  const [_, w, h, x, y, blink, fg, bg] =
    info.match(/([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})([01])([a-f0-9])([a-f0-9])/) as string[];

  const sizeX = parseInt(w, 16);
  const sizeY = parseInt(h, 16);

  if (terminal.sizeX !== sizeX || terminal.sizeY !== sizeY) {
    terminal.resize(sizeX, sizeY);
  }

  terminal.cursorX = parseInt(x, 16) - 1;
  terminal.cursorY = parseInt(y, 16) - 1;
  terminal.cursorBlink = blink === "1";

  terminal.currentFore = fg;
  terminal.currentBack = bg;

  for (let i = 0; i < 16; i++) {
    const [_p, r, g, b] =
      packet.substr(11 + i * 3 * 2, 3 * 2).match(/([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})/) as string[];
    terminal.palette[i.toString(16)] = `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`;
  }

  const start = 11 + 16 * 3 * 2;
  const size = sizeX * sizeY;
  for (let i = 0; i < sizeY; i++) {
    terminal.text[i] = packet.substr(start + size * 0 + i * sizeX, sizeX);
    terminal.fore[i] = packet.substr(start + size * 1 + i * sizeX, sizeX);
    terminal.back[i] = packet.substr(start + size * 2 + i * sizeX, sizeX);
  }
};

/**
 * LZW compression implementation
 */
const compress = (uncompressed: string) => {
  const dictionary: Map<string, number> = new Map();
  let dictSize = 255;
  for (let i = 0; i < 256; i++) dictionary.set(String.fromCharCode(i), i);

  const result: string[] = [];
  let ws = 0;
  for (let i = 0; i < uncompressed.length; i++) {
    const w = uncompressed.substring(ws, i + 1);
    if (!dictionary.has(w)) {
      result.push(String.fromCharCode(dictionary.get(uncompressed.substring(ws, i))!));
      // Add wc to the dictionary.
      dictionary.set(w, dictSize++);
      ws = i;
    }
  }

  // Output the code for w.
  if (ws < uncompressed.length) {
    result.push(String.fromCharCode(dictionary.get(uncompressed.substring(ws, uncompressed.length))!));
  }

  return result.join("");
};

/**
 * LZW decompression implementation
 */
const decompress = (compressed: string) => {
  const dictionary: string[] = [];
  let dictSize = 255;
  for (let i = 0; i < 256; i++) dictionary[i] = String.fromCharCode(i);

  const result = [];
  let w = "";
  for (let i = 0; i < compressed.length; i++) {
    const k = compressed.charCodeAt(i);
    let entry;
    if (dictionary[k] !== undefined) {
      entry = dictionary[k];
    } else if (k === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return null;
    }

    result.push(entry);
    dictionary[++dictSize] = w + entry.charAt(0);
    w = entry;
  }
  return result.join("");
};

const toBase64 = window.btoa;
const fromBase64 = window.atob;

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
  return s2 << 16 | s1;
};

export const decode30FileContents = (packet: string): {
  name: string,
  contents: string,
  flags: FileOpenFlags,
  checksum: number,
} | null => {
  const parsed = packet.match(/^([0-9a-f]{2})([0-9a-f]{8})([^\0]+)\0([\s\S]*)$/);
  if (!parsed) return null;

  const [_, flagStr, checksumStr, name, rawContents] = parsed;
  const flags = parseInt(flagStr, 16);
  const checksum = parseInt(checksumStr, 16);

  let contents: string | null;
  if (flags & FileOpenFlags.Compressed) {
    // Not yet implemented
    return null;
  } else {
    contents = rawContents;
  }
  if (contents === null) return null;

  return { name, contents, flags, checksum };
};

export const decode31FileAccept = (packet: string): { name: string, checksum: number } | null => {
  const parsed = packet.match(/([0-9a-f]{8})(.+)$/);
  if (!parsed) return null;

  const [_, checksumStr, name] = parsed;
  const checksum = parseInt(checksumStr, 16);
  return { name, checksum };
};
