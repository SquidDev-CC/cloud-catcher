import { Component, h } from "preact";
import { WebsocketCodes } from "../codes";
import { PacketCode, encodePacket } from "../network";
import { Token } from "../token";
import { Computer } from "./computer";
import { BufferingEventQueue, PacketEvent } from "./event";
import { LostConnection, TokenDisplay, UnknownError } from "./screens";
import { Settings } from "./settings";

export type MainProps = {
  token: Token;
};

type MainState = {
  websocket: WebSocket;
  events: BufferingEventQueue<PacketEvent>,
  settings: Settings,

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
    const socket = new WebSocket(`${protocol}//${window.location.host}/view?id=${token}`);
    const events = new BufferingEventQueue<PacketEvent>();

    const settings: Settings = {
      showInvisible: true,
      trimWhitespace: true,

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

    this.state = {
      websocket: socket,
      events,
      settings,

      currentVDom: () => <TokenDisplay token={token} />,
    };

    socket.addEventListener("error", event => {
      if (socket.readyState <= WebSocket.OPEN) socket.close(400);
      console.log(event);

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

      const code = parseInt(data.substr(0, 2), 16);
      switch (code) {
        case PacketCode.ConnectionAbuse:
        case PacketCode.ConnectionLost:
          this.setState({ currentVDom: () => <LostConnection token={token} /> });
          break;

        case PacketCode.ConnectionPing:
          socket.send(encodePacket(PacketCode.ConnectionPing));
          break;

        case PacketCode.TerminalContents:
        case PacketCode.FileContents:
          events.enqueue(new PacketEvent(code, data.substr(2)));
          this.setState({ currentVDom: this.computerVDom });
          break;

        case PacketCode.FileAccept:
        case PacketCode.FileReject:
          events.offer(new PacketEvent(code, data.substr(2)));
          break;

        default:
          console.error("Unknown packet " + code);
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
    return <div class="container">
      {state.currentVDom(state)}
      <div class="settings-cog" title="Configure how CloudCatcher behaves" onClick={this.openSettings}>&#x2699;</div>
      {
        state.dialogue ?
          <div class="dialogue-overlay" onClick={this.closeDialogueClick}>
            {state.dialogue(state)}
          </div> : ""
      }
    </div>;
  }

  private openSettings = () => {
    const update = (s: Settings) => this.setState({ settings: s });
    this.setState({ dialogue: s => <Settings settings={s.settings} update={update} /> });
  }

  private closeDialogueClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) this.setState({ dialogue: undefined });
  }

  private closeDialogueKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") this.setState({ dialogue: undefined });
  }

  private computerVDom = ({ events, websocket, settings, dialogue }: MainState) => {
    return <Computer events={events} connection={websocket} token={this.props.token}
      settings={settings} focused={dialogue === undefined} />;
  }
}
