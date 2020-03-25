import { ComputerActionable, LuaValue, Terminal, TerminalData, KeyCode, keyName } from "cc-web-term";
import { Component, h } from "preact";
import { computeDiff } from "../../diff";
import { FileAction, FileActionFlags, FileConsume, PacketCode, encodePacket } from "../../network";
import { Token } from "../../token";
import { BufferingEventQueue, PacketEvent, Semaphore } from "../event";
import { fletcher32 } from "../packet";
import { Settings } from "../settings";
import {
  active, computerSplit, computerView, fileComputer, fileEntry, fileIcon, fileIconModified, fileIconReadonly,
  fileInfo, fileList as fileListCls, fileName, terminalView,
} from "../styles.css";
import Editor, * as editor from "./editor";
import { Notification, NotificationBody, NotificationKind, Notifications } from "./notifications";

type FileInfo = {
  name: string,
  model: editor.LazyModel,
  readOnly: boolean,
  isNew: boolean,

  remoteChecksum: number,
  remoteContents: string,

  savedVersionId?: number,
  modified: boolean,
} & ({
  updateContents: undefined,
  updateChecksum: undefined,
  updateMark: undefined,
} | {
  updateContents: string,
  updateChecksum: number,
  updateMark?: number,
});

export type ComputerProps = {
  connection: WebSocket,
  events: BufferingEventQueue<PacketEvent>,
  focused: boolean,
  token: Token,
  settings: Settings,
};

type ComputerState = {
  activeFile: string | null,
  files: FileInfo[],
  notifications: Notification[],

  terminal: TerminalData,
  terminalChanged: Semaphore,

  id: number | null,
  label: string | null,
};

export class Computer extends Component<ComputerProps, ComputerState> implements ComputerActionable {
  public constructor(props: ComputerProps, context: any) {
    super(props, context);

    const state: ComputerState = {
      activeFile: null,
      files: [],
      notifications: [],
      terminal: new TerminalData(),
      terminalChanged: new Semaphore(),
      id: null, label: null,
    };
    this.setState(state);
  }

  public componentDidMount() {
    // This is a bit of a kuldge, as we need to queue this _before_ the
    // event buffer is flushed.
    this.props.events.attach(this.onPacket);
  }

  public componentWillUnmount() {
    this.props.events.detach(this.onPacket);
  }

  public render(
    { token, settings, focused }: ComputerProps,
    { activeFile, files, notifications, terminal, terminalChanged, id, label }: ComputerState,
  ) {
    const fileList = files.map(x => {
      // TODO: Too lazy to do this right now
      const fileClasses = fileEntry + " " + (x.name === activeFile ? active : "");
      const iconClasses = fileIcon
        + " " + (x.modified ? fileIconModified : "")
        + " " + (x.readOnly ? fileIconReadonly : "");
      const iconLabels = "Close editor" + (x.readOnly ? " (read only)" : "");

      let name = x.name;
      if (name.charAt(0) !== "/") name = "/" + name;
      const sepIndex = name.lastIndexOf("/");
      return <div key={x.name} class={fileClasses} onClick={this.createSelectFile(x.name)}>
        <div class={iconClasses} title={iconLabels} onClick={this.createClose(x.name)}></div>
        <div class={fileName}>{name.substr(sepIndex + 1)}</div>
        <div class={fileInfo}>{name.substr(0, sepIndex + 1)}</div>
      </div>;
    });

    const computerClasses = `${fileEntry} ${fileComputer} ${activeFile === null ? active : ""}`;
    const target = `${window.location.origin}/?id=${this.props.token}`;
    const activeInfo = activeFile === null ? null : files.find(x => x.name === activeFile);
    return <div class={computerView}>
      <Notifications notifications={notifications} onClose={this.onCloseNotification} />
      <div class={computerSplit}>
        <div class={fileListCls}>
          <div class={computerClasses} onClick={this.createSelectFile(null)}>
            <div class={fileName}>Remote files</div>
            <div class={fileInfo}>
              <a href={target} title="Get a shareable link of this session token"
                onClick={this.onClickToken}>{token}</a>
            </div>
          </div>
          {fileList}
        </div>
        {activeInfo == null || activeFile == null
          ? <div class={terminalView}>
            <Terminal computer={this} terminal={terminal} changed={terminalChanged} focused={focused}
              font={settings.terminalFont} on={true} id={id} label={label} />
          </div>
          : <Editor model={activeInfo.model} readOnly={activeInfo.readOnly} settings={settings} focused={focused}
            onChanged={this.createChanged(activeFile)}
            doSave={this.createSave(activeFile)} doClose={this.createClose(activeFile)} />}
      </div>
    </div>;
  }

  private createSelectFile(fileName: string | null) {
    return (e: Event) => {
      e.stopPropagation();
      if (fileName === null || this.state.files.find(x => x.name === fileName)) {
        this.setState({ activeFile: fileName });
      }
    };
  }

  private createClose(fileName: string) {
    return (e?: Event) => {
      if (e) e.stopPropagation();

      const file = this.state.files.find(x => x.name === fileName);

      this.setState({
        notifications: this.state.notifications.filter(x => !x.id.startsWith(fileName + "\0")),
        files: this.state.files.filter(x => x.name !== fileName),
        activeFile: this.state.activeFile === fileName ? null : this.state.activeFile,
      }, () => {
        if (file) editor.disposeModel(file.model);
      });
    };
  }

  private createChanged(fileName: string) {
    return (dirty: boolean) => {
      const file = this.state.files.find(x => x.name === fileName);
      if (!file || dirty === file.modified) return;
      this.setFileState(file, { modified: dirty });
    };
  }

  private createSave(fileName: string) {
    return (contents: string) => {
      const file = this.state.files.find(x => x.name === fileName);
      if (!file || file.readOnly) return;

      // So technically we should update the state, but I'm just mutating
      // for now as it doesn't change how things are displayed. I'm sorry.
      file.updateMark = editor.getVersion(file.model);
      file.updateChecksum = fletcher32(contents);
      file.updateContents = contents;

      this.props.connection.send(encodePacket({
        packet: PacketCode.FileAction,
        id: 0,

        actions: [
          file.isNew ? {
            file: file.name,
            checksum: file.remoteChecksum,
            action: FileAction.Replace,
            flags: 0,
            contents,
          } : {
              file: file.name,
              checksum: file.remoteChecksum,
              action: FileAction.Patch,
              flags: 0,
              delta: computeDiff(file.remoteContents, contents),
            },
        ],
      }));
    };
  }

  private onClickToken = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const target = `${window.location.origin}/?id=${this.props.token}`;
    if (target !== window.location.href && window.history.replaceState) {
      window.history.replaceState({ id: this.props.token }, window.name, target);
    }
  }

  private onCloseNotification = (id: string) => {
    this.setState({ notifications: this.state.notifications.filter(x => x.id !== id) });
  }

  private onPacket = ({ packet }: PacketEvent) => {
    if (packet.packet === PacketCode.TerminalContents) {

      const { terminal, terminalChanged } = this.state;

      // TODO: Simplify our storage of terminals.
      terminal.resize(packet.width, packet.height);

      terminal.cursorX = packet.cursorX - 1;
      terminal.cursorY = packet.cursorY - 1;
      terminal.cursorBlink = packet.cursorBlink;

      terminal.text = packet.text;
      terminal.fore = packet.fore;
      terminal.back = packet.back;

      for (const key in packet.palette) {
        if (packet.palette.hasOwnProperty(key)) {
          const colour = packet.palette[key];
          terminal.palette[key] = `rgb(${(colour >> 16) & 0xFF},${(colour >> 8) & 0xFF},${colour & 0xFF}`;
        }
      }

      terminalChanged.signal();
    } else if (packet.packet === PacketCode.TerminalInfo) {
      this.setState({
        id: packet.id === undefined ? null : packet.id,
        label: packet.label === undefined ? null : packet.label,
      });
    } else if (packet.packet === PacketCode.FileAction) {
      let { files, activeFile } = this.state;
      files = [...files];

      const results = packet.actions.map(actionEntry => {
        const { file: name, flags, checksum } = actionEntry;
        switch (actionEntry.action) {
          case FileAction.Delete:
            files = files.filter(x => x.name !== name);
            if (activeFile === name) activeFile = null;
            return { file: name, result: true };

          case FileAction.Replace: {
            let file = files.find(x => x.name === name);
            if (flags & FileActionFlags.Open) activeFile = name;
            if (!file) {
              // We're seeing the file for the first time, so create a model and
              // everything.
              const model = editor.createModel(actionEntry.contents, name, text => {
                // Setup some event listeners for this model
                text.onDidChangeContent(() => {
                  const file = this.state.files.find(x => x.name === name);
                  if (!file) return;

                  const modified = text.getAlternativeVersionId() !== file.savedVersionId;
                  if (modified !== file.modified) this.setFileState(file, { modified });
                });
              });

              file = {
                name, model,
                readOnly: (flags & FileActionFlags.ReadOnly) !== 0,
                isNew: (flags & FileActionFlags.New) !== 0,

                remoteContents: actionEntry.contents,
                remoteChecksum: fletcher32(actionEntry.contents),

                updateChecksum: undefined, updateContents: undefined, updateMark: undefined,

                modified: false,
                savedVersionId: editor.getVersion(model),
              };

              files.push(file);

              return { file: name, result: true };

            } else if (file.remoteChecksum === checksum || (flags & FileActionFlags.Force)) {
              // The remote checksum matches our current one, so update our model.
              editor.setContents(file.model, actionEntry.contents);
              file.remoteContents = actionEntry.contents;
              file.remoteChecksum = checksum;
              file.isNew = false;

              return { file: name, result: true };
            } else {
              // We couldn't update, so just inform the user about this problem.
              // TODO: Keep track of both the "good" version and the last version we got?
              this.pushFileNotification(file, NotificationKind.Warn, "update",
                <span><code>{file.name}</code> has been changed on the remote.</span>);

              return { file: name, result: false };
            }
          }

          default:
            // TODO: Support for patch
            return { file: name, result: false };
        }
      });

      files = files.sort((a, b) => a.name.localeCompare(b.name));
      this.setState({ files, activeFile });

      // TODO: Send results back to the broadcaster.
    } else if (packet.packet === PacketCode.FileConsume) {
      for (const info of packet.files) {
        const { file: name, result, checksum } = info;
        const file = this.state.files.find(x => x.name === name);
        if (file) {
          switch (result) {
            case FileConsume.OK:
              if (file.updateChecksum === checksum) {
                this.setFileState(file, {
                  savedVersionId: file.updateMark!,
                  modified: editor.getVersion(file.model) !== file.updateMark,

                  remoteChecksum: file.updateChecksum,
                  remoteContents: file.updateContents!,

                  updateMark: undefined,
                  updateChecksum: undefined,
                  updateContents: undefined,
                });

                this.removeFileNotification(file, "update");
              } else {
                this.pushFileNotification(file, NotificationKind.Warn, "update",
                  <span><code>{file.name}</code> has been changed on the remote.</span>);
              }
              break;

            case FileConsume.Reject:
              if (file.updateChecksum) {
                this.pushFileNotification(file, NotificationKind.Error, "update",
                  <span><code>{file.name}</code> could not be saved as it was changed on the remote client.</span>);
              }
              break;

            case FileConsume.Failure:
              if (file.updateChecksum) {
                this.pushFileNotification(file, NotificationKind.Error, "update",
                  <span><code>{file.name}</code> failed to save, is the file read only?</span>);
              }
              break;

          }
        }
      }
    }
  }

  /**
   * Update the state for a given file
   */
  private setFileState<K extends keyof FileInfo>(file: FileInfo, props: Pick<FileInfo, K>) {
    this.setState({
      files: this.state.files.map(x => x !== file ? x : { ...x, ...props }),
    });
  }

  /**
   * Push a notification with for a file
   */
  private pushFileNotification(file: FileInfo, kind: NotificationKind, category: string, message: NotificationBody) {
    const id = file.name + "\0" + category;

    const notifications = this.state.notifications.filter(x => x.id !== id);
    notifications.push({ id, kind, message });
    this.setState({ notifications });
  }

  /**
   * Push a notification with for a file, replacing any other notfifications for this file
   */
  private replaceFileNotification(file: FileInfo, kind: NotificationKind, category: string, message: NotificationBody) {
    const id = file.name + "\0" + category;

    const notifications = this.state.notifications.filter(x => !x.id.startsWith(file.name + "\0"));
    notifications.push({ id, kind, message });
    this.setState({ notifications });
  }

  private removeFileNotification(file: FileInfo, category: string) {
    const id = file.name + "\0" + category;
    this.setState({
      notifications: this.state.notifications.filter(x => x.id !== id),
    });
  }

  public queueEvent(name: string, args: LuaValue[]): void {
    this.props.connection.send(encodePacket({
      packet: PacketCode.TerminalEvents,
      events: [{ name, args }],
    }));
  }

  public keyDown(key: KeyCode, repeat: boolean): void {
    this.queueEvent("cloud_catcher_key", [keyName(key), repeat]);
  }

  public keyUp(key: KeyCode): void {
    this.queueEvent("cloud_catcher_key_up", [keyName(key)]);
  }

  public turnOn(): void {
    console.warn("Turning on does nothing");
  }

  public shutdown(): void {
    console.warn("Shutdown does nothing");
  }

  public reboot(): void {
    console.warn("Reboot does nothing");
  }
}
