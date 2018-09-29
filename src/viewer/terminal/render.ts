import { Palette, PaletteColour, TerminalData, defaultPalette } from "./data";

export type Font = {
  path: string,

  image: HTMLImageElement,
  promise?: Promise<Font>,

  scale: number,
  margin: number,

  paletteCache: { [key: string]: HTMLCanvasElement },
};

export const cellWidth = 6;
export const cellHeight = 9;

export const terminalMargin = 4;

const fonts: { [key: string]: Font } = {};

const loadPalette = ({ image, paletteCache }: Font, colour: PaletteColour) => {
  const cached = paletteCache[colour];
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;

  canvas.width = image.width;
  canvas.height = image.height;

  context.globalCompositeOperation = "destination-atop";
  context.fillStyle = colour;
  context.globalAlpha = 1.0;

  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(image, 0, 0);

  paletteCache[colour] = canvas;
  return canvas;
};

export const loadFont = (path: string) => {
  const cached = fonts[path];
  if (cached) return cached;

  const image = new Image();
  image.src = path;

  const font: Font = fonts[path] = {
    path,
    image,
    scale: 1,
    margin: 1,
    paletteCache: {},
  };

  font.promise = new Promise((resolve, _reject) => {
    image.onload = () => {
      for (const key in defaultPalette) {
        if (!defaultPalette.hasOwnProperty(key)) continue;
        loadPalette(font, defaultPalette[key]);
      }

      font.scale = font.margin = image.width / 256;
      font.promise = undefined;
      resolve(font);
    };
  });

  return font;
};

export const background = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  color: string, scale: number,
  width: number, height: number,
  palette: Palette,
): void => {
  let actualWidth = cellWidth * scale;
  let actualHeight = cellHeight * scale;
  let cellX = x * actualWidth + terminalMargin;
  let cellY = y * actualHeight + terminalMargin;

  if (x === 0) {
    cellX -= terminalMargin;
    actualWidth += terminalMargin;
  }
  if (x === width - 1) {
    actualWidth += terminalMargin;
  }

  if (y === 0) {
    cellY -= terminalMargin;
    actualHeight += terminalMargin;
  }
  if (y === height - 1) {
    actualHeight += terminalMargin;
  }

  ctx.beginPath();
  ctx.rect(cellX, cellY, actualWidth, actualHeight);
  ctx.fillStyle = palette[color];
  ctx.fill();
};

export const foreground = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  color: string, chr: string, palette: Palette,
  scale: number, font: Font,
): void => {
  if (font.promise) return;

  const actualWidth = cellWidth * scale;
  const actualHeight = cellHeight * scale;
  const cellX = x * actualWidth + terminalMargin;
  const cellY = y * actualHeight + terminalMargin;

  const charcode = chr.charCodeAt(0);
  const imageW = cellWidth * font.scale;
  const imageH = cellHeight * font.scale;
  const imgX = font.margin + (charcode % 16) * (imageW + font.margin * 2);
  const imgY = font.margin + Math.floor(charcode / 16) * (imageH + font.margin * 2);

  ctx.drawImage(
    loadPalette(font, palette[color]),
    imgX, imgY, imageW, imageH,
    cellX, cellY, cellWidth * scale, cellHeight * scale,
  );
};

export const terminal = (
  ctx: CanvasRenderingContext2D, term: TerminalData, blink: boolean,
  scale: number, font: Font,
) => {
  const sizeX = term.sizeX;
  const sizeY = term.sizeY;

  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      background(ctx, x, y, term.back[y].charAt(x), scale, term.sizeX, term.sizeY, term.palette);
      foreground(ctx, x, y, term.fore[y].charAt(x), term.text[y].charAt(x), term.palette, scale, font);
    }
  }

  if (
    blink && term.cursorBlink &&
    term.cursorX >= 0 && term.cursorX < sizeX &&
    term.cursorY >= 0 && term.cursorY < sizeY
  ) {
    foreground(ctx, term.cursorX, term.cursorY, term.currentFore, "_", term.palette, scale, font);
  }
};

export const bsod = (
  ctx: CanvasRenderingContext2D, width: number, height: number, text: string,
  scale: number, font: Font,
) => {
  ctx.beginPath();
  ctx.rect(
    0, 0,
    width * cellWidth * scale + terminalMargin * 2,
    height * cellHeight * scale + terminalMargin * 2,
  );
  ctx.fillStyle = defaultPalette.b;
  ctx.fill();

  const startX = Math.floor((width - text.length) / 2);
  const startY = Math.floor((height - 1) / 2);
  for (let x = 0; x < text.length; x++) {
    foreground(ctx, startX + x, startY, "0", text.charAt(x), defaultPalette, scale, font);
  }
};
