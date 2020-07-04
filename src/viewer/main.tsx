import { Styles } from "@squid-dev/cc-web-term";
import { Component, JSX, h } from "preact";
import { WebsocketCodes } from "../codes";
import { Capability, PacketCode, decodePacket, encodePacket } from "../network";
import type { Token } from "../token";
import { Computer } from "./computer";
import { BufferingEventQueue, PacketEvent } from "./event";
import { Cog } from "./font";
import { LostConnection, TokenDisplay, UnknownError } from "./screens";
import { Settings } from "./settings";
import { container, dialogueOverlay, settingsCog } from "./styles.css";
import termFont from "@squid-dev/cc-web-term/assets/term_font.png";

export type MainProps = {
  token: Token,
};

type MainState = {
  websocket: WebSocket,
  events: BufferingEventQueue<PacketEvent>,
  settings: Settings,

  hadConnected: boolean,
  currentVDom: (state: MainState) => JSX.Element,
  dialogue?: (state: MainState) => JSX.Element,
};

export class Main extends Component<MainProps, MainState> {
  public constructor(props: MainProps, context: any) {
    super(props, context);
  }

  public componentWillMount() {
    const { token } = this.props;
    const protocol = window.location.protocol === "http:" ? "ws:" : "wss:";
    const caps = [Capability.TerminalView, Capability.FileEdit].join(",");
    const socket = new WebSocket(`${protocol}//${window.location.host}/connect?id=${token}&capabilities=${caps}`);
    const events = new BufferingEventQueue<PacketEvent>();

    const settings: Settings = {
      showInvisible: true,
      trimWhitespace: true,

      terminalFont: termFont,

      darkMode: false,
      terminalBorder: false,
    };

    // Sync settings from local storage
    try {
      const settingJson = window.localStorage.settings;
      if (settings !== undefined) {
        const settingStorage = JSON.parse(settingJson);
        for (const key of Object.keys(settings)) {
          const value = settingStorage[key];
          if (value !== undefined) (settings as any)[key] = value;
        }
      }
    } catch {
      // Ignore
    }

    this.setState({
      websocket: socket,
      events,
      settings,

      hadConnected: false,
      currentVDom: () => <TokenDisplay token={token} />,
    });

    socket.addEventListener("error", event => {
      if (socket.readyState <= WebSocket.OPEN) socket.close(400);
      console.error(event);

      this.setState({ currentVDom: () => <UnknownError error={`${event}`} /> });
    });

    socket.addEventListener("close", event => {
      console.error(event);

      this.setState({
        currentVDom: () => <UnknownError error="The socket was closed. Is your internet down?" />,
      });
    });

    socket.addEventListener("message", message => {
      const data = message.data;
      if (typeof data !== "string") return;

      const packet = decodePacket(data);
      if (!packet) {
        console.error("Invalid packet received");
        return;
      }

      switch (packet.packet) {
        case PacketCode.ConnectionUpdate: {
          /* If we've got some client which looks vaguely interesting, switch to
             the computer display.  Otherwise, either show the token screen if
             we've never established a connection, or the lost connection if we
             have. */
          const capabilities = new Set(packet.capabilities);
          if (capabilities.has(Capability.TerminalHost) || capabilities.has(Capability.FileHost)) {
            this.setState({
              currentVDom: this.computerVDom,
              hadConnected: true,
            });
          } else if (this.state.hadConnected) {
            this.setState({ currentVDom: () => <LostConnection token={token} /> });
          } else {
            this.setState({ currentVDom: () => <TokenDisplay token={token} /> });
          }
          break;
        }

        case PacketCode.ConnectionAbuse:
          // We currently do nothing, might be a good idea to change that.
          break;

        case PacketCode.ConnectionPing:
          socket.send(encodePacket({ packet: PacketCode.ConnectionPing }));
          break;

        case PacketCode.TerminalContents:
        case PacketCode.TerminalInfo:
        case PacketCode.FileAction:
        case PacketCode.FileConsume:
        case PacketCode.FileListing:
        case PacketCode.FileRequest:
          events.enqueue(new PacketEvent(packet));
          break;

        default:
          console.error("Unknown packet " + packet.packet);
          break;
      }
    });
  }

  public componentWillUnmount() {
    const socket = this.state && this.state.websocket;
    if (socket) socket.close(WebsocketCodes.Normal);
  }

  public shouldComponentUpdate(_props: MainProps, newState: MainState) {
    return this.state.currentVDom !== newState.currentVDom ||
      this.state.dialogue !== newState.dialogue ||
      this.state.settings !== newState.settings;
  }

  public componentDidUpdate() {
    // Sync settings back to local storage
    try {
      window.localStorage.settings = JSON.stringify(this.state.settings);
    } catch {
      // Ignore
    }
  }

  public render(_props: MainProps, state: MainState) {
    return <div class={container}>
      {state.currentVDom(state)}
      <button class={`${Styles.actionButton} ${settingsCog}`}
        title="Configure how CloudCatcher behaves"
        onClick={this.openSettings}>
        <Cog />
      </button>
      {
        state.dialogue ?
          <div class={dialogueOverlay} onClick={this.closeDialogueClick}>
            {state.dialogue(state)}
          </div> : ""
      }
    </div>;
  }

  private openSettings = () => {
    const update = (s: Settings) => this.setState({ settings: s });
    this.setState({ dialogue: (s: MainState) => <Settings settings={s.settings} update={update} /> });
  }

  private closeDialogueClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) this.setState({ dialogue: undefined });
  }

  private computerVDom = ({ events, websocket, settings, dialogue }: MainState) => {
    return <Computer events={events} connection={websocket} token={this.props.token}
      settings={settings} focused={dialogue === undefined} />;
  }
}
