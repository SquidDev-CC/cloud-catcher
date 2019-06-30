import { Component, h } from "preact";
import { PacketCode, encodePacket } from "../../network";
import { Semaphore } from "../event";
import { NoEntry } from "../font";
import { TerminalData } from "../terminal/data";
import { convertKey, convertMouseButton, convertMouseButtons } from "../terminal/input";
import * as render from "../terminal/render";

export type TerminalProps = {
  changed: Semaphore,
  connection: WebSocket,
  focused: boolean,
  terminal: TerminalData,
  font: string,

  id?: number,
  label?: string,
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const labelElement = (id?: number, label?: string) => {
  if (id === undefined) {
    return <span class="terminal-info">Connected</span>;
  } else if (label === undefined) {
    return <span class="terminal-info">
      Connected to computer #{id}
    </span>;
  } else {
    return <span class="terminal-info">
      Connected to <span class="terminal-info-label">{label}</span> (#{id})
    </span>;
  }
};

export class Terminal extends Component<TerminalProps, {}> {
  private canvasElem?: HTMLCanvasElement;
  private canvasContext?: CanvasRenderingContext2D;
  private inputElem?: HTMLInputElement;
  private barElem?: HTMLDivElement;

  private changed: boolean = false;
  private lastBlink: boolean = false;

  private mounted: boolean = false;
  private drawQueued: boolean = false;

  private readonly vdom: JSX.Element[];

  private lastX: number = -1;
  private lastY: number = -1;

  public constructor(props: TerminalProps, context: any) {
    super(props, context);

    this.vdom = [
      <canvas class="terminal-canvas"
        onMouseDown={this.onMouse} onMouseUp={this.onMouse} onMouseMove={this.onMouse}
        onWheel={this.onMouseWheel} onContextMenu={this.onEventDefault} />,
      <input type="text" class="terminal-input"
        onPaste={this.onPaste} onKeyDown={this.onKey} onKeyUp={this.onKey}></input>,
    ];
  }

  public componentDidMount() {
    // Fetch the "key" elements
    this.canvasElem = this.base!.querySelector(".terminal-canvas") as HTMLCanvasElement;
    this.canvasContext = this.canvasElem.getContext("2d") as CanvasRenderingContext2D;
    this.inputElem = this.base!.querySelector(".terminal-input") as HTMLInputElement;
    this.barElem = this.base!.querySelector(".terminal-bar") as HTMLDivElement;

    // Subscribe to some events to allow us to shedule a redraw
    window.addEventListener("resize", this.onResized);
    this.props.changed.attach(this.onChanged);

    // Set some key properties
    this.changed = true;
    this.lastBlink = false;
    this.mounted = true;

    // Focus on the input element
    if (this.props.focused) this.inputElem.focus();

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

  public render({ id, label }: TerminalProps) {
    return <div class="terminal-view">
      {...this.vdom}
      <div class="terminal-bar">
        {labelElement(id, label)}
        <button type="none" class="action-button terminal-terminate"
          title="Send a `terminate' event to the computer." onClick={this.onTerminate}>
          <NoEntry />
        </button>
      </div>
    </div>;
  }

  public componentDidUpdate() {
    this.queueDraw();
    if (this.props.focused && this.inputElem) this.inputElem.focus();
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

    const { terminal, font: fontPath } = this.props;
    const sizeX = terminal.sizeX || 51;
    const sizeY = terminal.sizeY || 19;

    const font = render.loadFont(fontPath);
    if (font.promise) {
      font.promise.then(() => this.queueDraw());
      return;
    }

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
    const actualWidth = this.canvasElem.parentElement!.clientWidth - render.terminalMargin;
    const width = sizeX * render.cellWidth;
    const height = sizeY * render.cellHeight;

    // The scale has to be an integer (though converted within the renderer) to ensure pixels are integers.
    // Otherwise you get texture issues.
    const scale = Math.max(1, Math.floor(actualWidth / width));

    const ctx = this.canvasContext;

    // If we"re just redrawing the cursor. We"ve aborted earlier if the cursor is not visible/
    // out of range and hasn"t changed.
    if (!changed) {
      if (blink) {
        render.foreground(
          ctx, terminal.cursorX, terminal.cursorY, terminal.currentFore, "_", terminal.palette,
          scale, font,
        );
      } else {
        const x = terminal.cursorX;
        const y = terminal.cursorY;

        render.background(ctx, x, y, terminal.back[y].charAt(x), scale, sizeX, sizeY, terminal.palette);
        render.foreground(
          ctx, x, y, terminal.fore[y].charAt(x), terminal.text[y].charAt(x), terminal.palette,
          scale, font,
        );
      }

      return;
    }

    // Actually update the canvas dimensions.
    const canvasWidth = width * scale + render.terminalMargin * 2;
    const canvasHeight = height * scale + render.terminalMargin * 2;

    if (this.canvasElem.height !== canvasHeight || this.canvasElem.width !== canvasWidth) {
      this.canvasElem.height = canvasHeight;
      this.canvasElem.width = canvasWidth;

      this.canvasElem.style.height = `${canvasHeight}px`;
      this.canvasElem.style.width = `${canvasWidth}px`;

      if (this.barElem) {
        this.barElem.style.width = `${canvasWidth}px`;
      }
    }

    // Prevent blur when up/down-scaling
    ctx.imageSmoothingEnabled = false;
    (ctx as any).oImageSmoothingEnabled = false;
    (ctx as any).webkitImageSmoothingEnabled = false;
    (ctx as any).mozImageSmoothingEnabled = false;
    (ctx as any).msImageSmoothingEnabled = false;

    // And render!
    if (terminal.sizeX === 0 && terminal.sizeY === 0) {
      render.bsod(ctx, sizeX, sizeY, "No terminal output", scale, font);
    } else {
      render.terminal(ctx, terminal, blink, scale, font);
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

    this.props.connection.send(encodePacket({
      packet: PacketCode.TerminalEvents,
      events: [{ name: "paste", args: [content] }],
    }));
  }

  private onPaste = (event: ClipboardEvent) => {
    this.onEventDefault(event);
    this.paste((event.clipboardData || (window as any).clipboardData));
  }

  private onMouse = (event: MouseEvent) => {
    this.onEventDefault(event);
    if (!this.canvasElem) return;

    // If we"re a mouse move and nobody is pressing anything, let"s
    // skip for now.
    if (event.type === "mousemove" && event.buttons === 0) return;

    const x = clamp(
      Math.floor((event.pageX - this.canvasElem.offsetLeft - render.terminalMargin)
        / (this.canvasElem.width - 2 * render.terminalMargin) * this.props.terminal.sizeX) + 1,
      1, this.props.terminal.sizeX);
    const y = clamp(
      Math.floor((event.pageY - this.canvasElem.offsetTop - render.terminalMargin)
        / (this.canvasElem.height - 2 * render.terminalMargin) * this.props.terminal.sizeY) + 1,
      1, this.props.terminal.sizeY);

    switch (event.type) {
      case "mousedown": {
        const button = convertMouseButton(event.button);
        if (button) {
          this.props.connection.send(encodePacket({
            packet: PacketCode.TerminalEvents,
            events: [{ name: "mouse_click", args: [button, x, y] }],
          }));
          this.lastX = x;
          this.lastY = y;
        }
        break;
      }
      case "mouseup": {
        const button = convertMouseButton(event.button);
        if (button) {
          this.props.connection.send(encodePacket({
            packet: PacketCode.TerminalEvents,
            events: [{ name: "mouse_up", args: [button, x, y] }],
          }));
          this.lastX = x;
          this.lastY = y;
        }
      }
      case "mousemove": {
        const button = convertMouseButtons(event.buttons);
        if (button && (x !== this.lastX || y !== this.lastY)) {
          this.props.connection.send(encodePacket({
            packet: PacketCode.TerminalEvents,
            events: [{ name: "mouse_drag", args: [button, x, y] }],
          }));
          this.lastX = x;
          this.lastY = y;
        }
      }
    }
  }

  private onMouseWheel = (event: WheelEvent) => {
    this.onEventDefault(event);
    if (!this.canvasElem) return;

    const x = clamp(
      Math.floor((event.pageX - this.canvasElem.offsetLeft - render.terminalMargin)
        / (this.canvasElem.width - 2 * render.terminalMargin) * this.props.terminal.sizeX) + 1,
      1, this.props.terminal.sizeX);
    const y = clamp(
      Math.floor((event.pageY - this.canvasElem.offsetTop - render.terminalMargin)
        / (this.canvasElem.height - 2 * render.terminalMargin) * this.props.terminal.sizeY) + 1,
      1, this.props.terminal.sizeY);

    if (event.deltaY !== 0) {
      this.props.connection.send(encodePacket({
        packet: PacketCode.TerminalEvents,
        events: [{ name: "mouse_scroll", args: [Math.sign(event.deltaY), x, y] }],
      }));
    }
  }

  private onEventDefault = (event: Event) => {
    event.preventDefault();
    if (this.inputElem) this.inputElem.focus();
  }

  private onKey = (event: KeyboardEvent) => {
    const code = convertKey(event.code);
    if (!code || !this.canvasElem) return;

    // Handle pasting. Might be worth adding shift+insert support too.
    // Note this is needed as we block the main paste event.
    if (event.type === "keydown" && (event.ctrlKey && event.code === "KeyV")) {
      const data = (window as any).clipboardData;
      if (data) {
        this.paste(data);
        event.preventDefault();
      }
      return;
    }

    // Prevent the default action from occuring. This is a little
    // overkill, but there you go.
    event.preventDefault();

    if (event.type === "keydown") {
      const events: Array<{ name: string, args: any[] }> = [{ name: "key", args: [code, event.repeat] }];
      if (!event.altKey && !event.ctrlKey && event.key.length === 1) {
        events.push({ name: "char", args: [event.key] });
      }

      this.props.connection.send(encodePacket({
        packet: PacketCode.TerminalEvents,
        events,
      }));
    } else if (event.type === "keyup") {
      this.props.connection.send(encodePacket({
        packet: PacketCode.TerminalEvents,
        events: [{ name: "key_up", args: [code] }],
      }));
    }
  }

  private onTerminate = (event: Event) => {
    this.onEventDefault(event);
    this.props.connection.send(encodePacket({
      packet: PacketCode.TerminalEvents,
      events: [{ name: "terminate", args: [] }],
    }));
  }

  private onChanged = () => {
    this.changed = true;
    this.queueDraw();
  }
}
