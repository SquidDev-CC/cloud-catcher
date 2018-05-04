import { Component, h } from "preact";
import { encodeByte, encodeNibble, encodePacket, PacketCode } from "../../network";
import { Semaphore } from "../event";
import { TerminalData } from "../terminal/data";
import { convertKey, convertMouseButton } from "../terminal/input";
import * as render from "../terminal/render";

export type TerminalProps = {
  connection: WebSocket,
  terminal: TerminalData,
  changed: Semaphore,
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export class Terminal extends Component<TerminalProps, {}> {
  private canvasElem?: HTMLCanvasElement;
  private canvasContext?: CanvasRenderingContext2D;
  private inputElem?: HTMLInputElement;

  private changed: boolean = false;
  private lastBlink: boolean = false;

  private mounted: boolean = false;
  private drawQueued: boolean = false;

  private readonly vdom: JSX.Element;

  private lastX: number = -1;
  private lastY: number = -1;

  public constructor(props: TerminalProps, context: any) {
    super(props, context);

    this.vdom = <div class="terminal-view">
      <canvas class="terminal-canvas"
        onMouseDown={this.onMouse} onMouseUp={this.onMouse} onMouseMove={this.onMouse}
        onWheel={this.onMouseWheel} onContextMenu={this.onContext} />
      <input type="text" class="terminal-input"
        onPaste={this.onPaste} onKeyDown={this.onKey} onKeyUp={this.onKey}></input>
    </div>;
  }

  public componentDidMount() {
    // Fetch the "key" elements
    this.canvasElem = this.base.querySelector(".terminal-canvas") as HTMLCanvasElement;
    this.canvasContext = this.canvasElem.getContext("2d") as CanvasRenderingContext2D;
    this.inputElem = this.base.querySelector(".terminal-input") as HTMLInputElement;

    // Subscribe to some events to allow us to shedule a redraw
    window.addEventListener("resize", this.onResized);
    this.props.changed.attach(this.onChanged);

    // Set some key properties
    this.changed = true;
    this.lastBlink = false;
    this.mounted = true;

    // Focus on the input element
    this.inputElem.focus();

    // And let's draw!
    this.queueDraw();
  }

  public componentWillUnmount() {
    this.canvasElem = undefined;
    this.canvasContext = undefined;
    this.inputElem = undefined;

    this.props.changed.detach(this.onChanged);
    window.removeEventListener("resize", this.onResized);

    this.lastBlink = false;
    this.mounted = false;
    this.drawQueued = false;
  }

  public render() {
    return this.vdom;
  }

  public componentWillUpdate() {
    return false;
  }

  public queueDraw() {
    if (this.mounted && !this.drawQueued) {
      this.drawQueued = true;
      window.requestAnimationFrame(time => {
        this.drawQueued = false;
        if (!this.mounted) return;

        this.draw(time);

        // Schedule another redraw to handle the cursor blink
        if (this.props.terminal.cursorBlink) this.queueDraw();
      });
    }
  }

  private draw(time: number) {
    if (!this.canvasElem || !this.canvasContext) return;

    const terminal = this.props.terminal;
    const sizeX = terminal.sizeX || 51;
    const sizeY = terminal.sizeY || 19;

    const blink = Math.floor(time / 400) % 2 === 0;
    const changed = this.changed;

    if (!changed && (
      !terminal.cursorBlink || this.lastBlink === blink ||
      terminal.cursorX < 0 || terminal.cursorX >= sizeX ||
      terminal.cursorY < 0 || terminal.cursorY >= sizeY
    )) {
      return;
    }

    this.lastBlink = blink;
    this.changed = false;

    // Calculate terminal scaling to fit the screen
    const actualWidth = this.canvasElem.parentElement!.clientWidth - render.margin;
    const width = sizeX * render.pixelWidth;
    const height = sizeY * render.pixelHeight;

    // The scale has to be an integer (though converted within the renderer) to ensure pixels are integers.
    // Otherwise you get texture issues.
    let scale = Math.floor(actualWidth / width);
    if (scale < 1) scale = 1;
    if (scale > 6) scale = 6;

    const ctx = this.canvasContext;

    // If we"re just redrawing the cursor. We"ve aborted earlier if the cursor is not visible/
    // out of range and hasn"t changed.
    if (!changed) {
      if (blink) {
        render.foreground(ctx, terminal.cursorX, terminal.cursorY, terminal.currentFore, "_", scale, terminal.palette);
      } else {
        const x = terminal.cursorX;
        const y = terminal.cursorY;

        render.background(ctx, x, y, terminal.back[y].charAt(x), scale, sizeX, sizeY, terminal.palette);
        render.foreground(ctx, x, y, terminal.fore[y].charAt(x), terminal.text[y].charAt(x), scale, terminal.palette);
      }

      return;
    }

    // Actually update the canvas dimensions.
    const canvasWidth = width * scale + render.margin * 2;
    const canvasHeight = height * scale + render.margin * 2;

    if (this.canvasElem.height !== canvasHeight || this.canvasElem.width !== canvasWidth) {
      this.canvasElem.height = canvasHeight;
      this.canvasElem.width = canvasWidth;
    }

    // Prevent blur when up/down-scaling
    (ctx as any).imageSmoothingEnabled = false; // Isn"t standardised so we have to cast.
    ctx.oImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    (ctx as any).msImageSmoothingEnabled = false;

    // And render!
    if (terminal.sizeX === 0 && terminal.sizeY === 0) {
      render.bsod(ctx, sizeX, sizeY, scale, "No terminal output");
    } else {
      render.terminal(ctx, terminal, scale, blink);
    }
  }

  private onResized = () => {
    this.changed = true;
    this.queueDraw();
  }

  private paste(clipboard: DataTransfer | undefined) {
    if (!clipboard) return;
    let content = clipboard.getData("text");
    if (!content) return;

    // Limit to allowed characters (actually slightly more generous but
    // there you go).
    content = content.replace(/[^\x20-\xFF]/gi, ""); // .substr(0, 256));
    // Strip to the first newline
    content = content.replace(/[\r\n].*/, "");
    // Limit to 512 characters
    content = content.substr(0, 512);

    // Abort if we"re empty
    if (!content) return;

    this.props.connection.send(encodePacket(PacketCode.EventPaste) + content);

  }

  private onPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    this.paste((event.clipboardData || (window as any).clipboardData));
  }

  private onMouse = (event: MouseEvent) => {
    event.preventDefault();
    if (!this.canvasElem) return;

    // If we"re a mouse move and nobody is pressing anything, let"s
    // skip for now.
    if (event.type === "mousemove" && event.buttons === 0) return;

    const x = clamp(
      Math.floor((event.pageX - this.canvasElem.offsetLeft - render.margin)
        / (this.canvasElem.width - 2 * render.margin) * this.props.terminal.sizeX) + 1,
      1, this.props.terminal.sizeX);
    const y = clamp(
      Math.floor((event.pageY - this.canvasElem.offsetTop - render.margin)
        / (this.canvasElem.height - 2 * render.margin) * this.props.terminal.sizeY) + 1,
      1, this.props.terminal.sizeY);
    const button = convertMouseButton(event.button);

    if (button) {
      if (event.type === "mousedown") {
        this.props.connection.send(encodePacket(PacketCode.EventMouse) +
          encodeNibble(0) + encodeNibble(button) +
          encodeByte(x) + encodeByte(y));
      } else if (event.type === "mouseup") {
        this.props.connection.send(encodePacket(PacketCode.EventMouse) +
          encodeNibble(1) + encodeNibble(button) +
          encodeByte(x) + encodeByte(y));
      } else if (event.type === "mousemove" && (x !== this.lastX || y !== this.lastY)) {
        this.props.connection.send(encodePacket(PacketCode.EventMouse) +
          encodeNibble(2) + encodeNibble(button) +
          encodeByte(x) + encodeByte(y));
      }

      this.lastX = x;
      this.lastY = y;
    }

    if (this.inputElem) this.inputElem.focus();
  }

  private onMouseWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!this.canvasElem) return;

    const x = clamp(
      Math.floor((event.pageX - this.canvasElem.offsetLeft - render.margin)
        / (this.canvasElem.width - 2 * render.margin) * this.props.terminal.sizeX) + 1,
      1, this.props.terminal.sizeX);
    const y = clamp(
      Math.floor((event.pageY - this.canvasElem.offsetTop - render.margin)
        / (this.canvasElem.height - 2 * render.margin) * this.props.terminal.sizeY) + 1,
      1, this.props.terminal.sizeY);

    if (event.deltaY !== 0) {
      this.props.connection.send(encodePacket(PacketCode.EventMouse) +
        encodeNibble(3) + encodeNibble(Math.sign(event.deltaY) + 1) +
        encodeByte(x) + encodeByte(y));
    }
  }

  private onContext = (event: MouseEvent) => {
    event.preventDefault();
    if (this.inputElem) this.inputElem.focus();
  }

  private onKey = (event: KeyboardEvent) => {
    const code = convertKey(event.code);
    if (!code || !this.canvasElem) return;

    // Prevent the default action from occuring. This is a little
    // overkill, but there you go.
    event.preventDefault();

    // Handle pasting. Might be worth adding shift+insert support too.
    // Note this is needed as we block the main paste event.
    if (event.type === "keydown" && (event.ctrlKey && event.code === "KeyV")) {
      this.paste((window as any).clipboardData);
    }

    if (event.type === "keydown") {
      const char = !event.altKey && !event.ctrlKey && event.key.length === 1 ? event.key : "";

      this.props.connection.send(encodePacket(PacketCode.EventKey) +
        encodeNibble(event.repeat ? 0 : 1) + encodeByte(code) + char);
    } else if (event.type === "keyup") {
      this.props.connection.send(encodePacket(PacketCode.EventKey) +
        encodeNibble(2) + encodeByte(code));
    }
  }

  private onChanged = () => {
    this.changed = true;
    this.queueDraw();
  }
}
