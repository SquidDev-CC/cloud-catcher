import { defaultPalette, Palette, PaletteColour, TerminalData } from "./data";

const cellWidth = 6;
const cellHeight = 9;

// Computed from above: the GCD of the two dimensions.
// By always scaling to an integer we ensure the texture offsets are also integers.
const cellGCD = 3;

export const pixelWidth = cellWidth / cellGCD;
export const pixelHeight = cellHeight / cellGCD;

export const margin = 4;

const fontWidth = 96;
const fontHeight = 144;

const font = new Image();
font.src = "assets/termFont.png";

const fonts: { [key: string]: HTMLCanvasElement } = {};

const loadFont = (colour: PaletteColour) => {
  const cached = fonts[colour];
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;

  canvas.width = fontWidth;
  canvas.height = fontHeight;

  context.globalCompositeOperation = "destination-atop";
  context.fillStyle = colour;
  context.globalAlpha = 1.0;

  context.fillRect(0, 0, fontWidth, fontHeight);
  context.drawImage(font, 0, 0);

  fonts[colour] = canvas;
  return canvas;
};

// Generate a series of fonts for each color code
let fontLoaded = false;
font.onload = () => {
  for (const key in defaultPalette) {
    if (!defaultPalette.hasOwnProperty(key)) continue;
    loadFont(defaultPalette[key]);
  }

  fontLoaded = true;
};

export const background = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  color: string, scale: number,
  width: number, height: number,
  palette: Palette,
): void => {
  scale /= 3;

  let actualWidth = cellWidth * scale;
  let actualHeight = cellHeight * scale;
  let cellX = x * actualWidth + margin;
  let cellY = y * actualHeight + margin;

  if (x === 0) {
    cellX -= margin;
    actualWidth += margin;
  }
  if (x === width - 1) {
    actualWidth += margin;
  }

  if (y === 0) {
    cellY -= margin;
    actualHeight += margin;
  }
  if (y === height - 1) {
    actualHeight += margin;
  }

  ctx.beginPath();
  ctx.rect(cellX, cellY, actualWidth, actualHeight);
  ctx.fillStyle = palette[color];
  ctx.fill();
};

export const foreground = (
  ctx: CanvasRenderingContext2D, x: number, y: number,
  color: string, chr: string, scale: number, palette: Palette,
): void => {
  if (!fontLoaded) return;

  scale /= 3;

  const actualWidth = cellWidth * scale;
  const actualHeight = cellHeight * scale;
  const cellX = x * actualWidth + margin;
  const cellY = y * actualHeight + margin;

  const point = chr.charCodeAt(0);

  const imgX = (point % (fontWidth / cellWidth)) * cellWidth;
  const imgY = Math.floor(point / (fontHeight / cellHeight)) * cellHeight;

  ctx.drawImage(
    loadFont(palette[color]),
    imgX, imgY, cellWidth, cellHeight,
    cellX, cellY, cellWidth * scale, cellHeight * scale,
  );
};

export const terminal = (ctx: CanvasRenderingContext2D, term: TerminalData, scale: number, blink: boolean) => {
  const sizeX = term.sizeX;
  const sizeY = term.sizeY;

  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      background(ctx, x, y, term.back[y].charAt(x), scale, term.sizeX, term.sizeY, term.palette);
      foreground(ctx, x, y, term.fore[y].charAt(x), term.text[y].charAt(x), scale, term.palette);
    }
  }

  if (
    blink && term.cursorBlink &&
    term.cursorX >= 0 && term.cursorX < sizeX &&
    term.cursorY >= 0 && term.cursorY < sizeY
  ) {
    foreground(ctx, term.cursorX, term.cursorY, term.currentFore, "_", scale, term.palette);
  }
};

export const bsod = (
  ctx: CanvasRenderingContext2D, width: number, height: number,
  scale: number, text: string,
) => {
  const oScale = scale / 3;

  ctx.beginPath();
  ctx.rect(
    0, 0,
    width * cellWidth * oScale + margin * 2,
    height * cellHeight * oScale + margin * 2,
  );
  ctx.fillStyle = defaultPalette.b;
  ctx.fill();

  const startX = Math.floor((width - text.length) / 2);
  const startY = Math.floor((height - 1) / 2);
  for (let x = 0; x < text.length; x++) {
    foreground(ctx, startX + x, startY, "0", text.charAt(x), scale, defaultPalette);
  }
};
