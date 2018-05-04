import { Component, h } from "preact";
import { WebsocketCodes } from "../codes";
import { PacketCode, encodePacket } from "../network";
import { Token } from "../token";
import { Computer } from "./computer";
import { BufferingEventQueue, PacketEvent } from "./event";
import { LostConnection, TokenDisplay, UnknownError } from "./screens";

export type MainProps = {
  token: Token;
};

type MainState = {
  websocket: WebSocket;
  events: BufferingEventQueue<PacketEvent>,

  computerVDom: JSX.Element,
  currentVDom: JSX.Element,
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

    this.state = {
      websocket: socket,
      events,

      computerVDom: <Computer events={events} connection={socket} token={token} />,
      currentVDom: <TokenDisplay token={token} />,
    };

    socket.addEventListener("error", event => {
      if (socket.readyState <= WebSocket.OPEN) socket.close(400);
      console.log(event);

      this.setState({ currentVDom: <UnknownError error={`${event}`} /> });
    });

    socket.addEventListener("close", event => {
      console.error(event);

      this.setState({
        currentVDom: <UnknownError error="The socket was closed. Is your internet down?" />,
      });
    });

    socket.addEventListener("message", message => {
      const data = message.data;
      if (typeof data !== "string") return;

      const code = parseInt(data.substr(0, 2), 16);
      switch (code) {
        case PacketCode.ConnectionAbuse:
        case PacketCode.ConnectionLost:
          this.setState({ currentVDom: <LostConnection token={token} /> });
          break;

        case PacketCode.ConnectionPing:
          socket.send(encodePacket(PacketCode.ConnectionPing));
          break;

        case PacketCode.TerminalContents:
        case PacketCode.FileContents:
        case PacketCode.FileAccept:
        case PacketCode.FileReject:
          events.enqueue(new PacketEvent(code, data.substr(2)));
          this.setState({ currentVDom: this.state.computerVDom });
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
    return this.state.currentVDom !== newState.currentVDom;
  }

  public render(_props: MainProps, state: MainState) {
    return state.currentVDom;
  }
}
