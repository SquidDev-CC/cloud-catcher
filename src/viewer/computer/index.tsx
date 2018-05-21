import { Component, h } from "preact";
import { FileOpenFlags, PacketCode, encodeByte, encodePacket, encodeU32 } from "../../network";
import { Token } from "../../token";
import { BufferingEventQueue, PacketEvent, Semaphore } from "../event";
import { decode10TerminalChanged, decode30FileContents, decode31FileAccept, fletcher32 } from "../packet";
import { Settings } from "../settings";
import { Terminal } from "../terminal/component";
import { TerminalData } from "../terminal/data";
import Editor, * as editor from "./editor";
import { Notification, NotificationBody, NotificationKind, Notifications } from "./notifications";

type FileInfo = {
  name: string,
  model: editor.Model,
  readOnly: boolean,

  remoteChecksum: number,
  updateChecksum?: number,
  updateMark?: number,

  savedVersionId: number,
  modified: boolean,
};

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
};

export class Computer extends Component<ComputerProps, ComputerState> {
  public constructor(props: ComputerProps, context: any) {
    super(props, context);

    this.state = {
      activeFile: null,
      files: [],
      notifications: [],
      terminal: new TerminalData(),
      terminalChanged: new Semaphore(),
    };
  }

  public componentDidMount() {
    // This is a bit of a kuldge, as we need to queue this _before_ the
    // event buffer is flushed.
    this.props.events.attach(this.onPacket);
  }

  public componentWillUnmount() {
    this.props.events.detach(this.onPacket);
  }

  public render({ connection, token, settings, focused }: ComputerProps, { activeFile, files, notifications, terminal, terminalChanged }: ComputerState) {
    const fileList = files.map(x => {
      const fileClasses = "file-entry" + (x.name === activeFile ? " active" : "");
      const iconClasses = "file-icon"
        + (x.modified ? " file-icon-modified" : "")
        + (x.readOnly ? " file-icon-readonly" : "");
      const iconLabels = "Close editor" + (x.readOnly ? " (read only)" : "");

      let name = x.name;
      if (name.charAt(0) !== "/") name = "/" + name;
      const sepIndex = name.lastIndexOf("/");
      return <div key={x.name} class={fileClasses} onClick={this.createSelectFile(x.name)}>
        <div class={iconClasses} title={iconLabels} onClick={this.createClose(x.name)}></div>
        <div class="file-name">{name.substr(sepIndex + 1)}</div>
        <div class="file-info">{name.substr(0, sepIndex + 1)}</div>
      </div>;
    });

    const computerClasses = "file-entry file-computer" + (activeFile === null ? " active" : "");
    const target = `${window.location.origin}/?id=${this.props.token}`;
    const activeInfo = activeFile === null ? null : files.find(x => x.name === activeFile);
    return <div class="computer-view">
      <Notifications notifications={notifications} onClose={this.onCloseNotification} />
      <div class="computer-split">
        <div class="file-list">
          <div class={computerClasses} onClick={this.createSelectFile(null)}>
            <div class="file-name">Remote files</div>
            <div class="file-info">
              <a href={target} title="Get a shareable link of this session token" onClick={this.onClickToken}>{token}</a>
            </div>
          </div>
          {fileList}
        </div>
        {activeInfo == null || activeFile == null
          ? <Terminal terminal={terminal} changed={terminalChanged} connection={connection} focused={focused} />
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

      this.setState({
        notifications: this.state.notifications.filter(x => !x.id.startsWith(fileName + "\0")),
        files: this.state.files.filter(x => x.name !== fileName),
        activeFile: this.state.activeFile === fileName ? null : this.state.activeFile,
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
      file.updateMark = file.model.text.getAlternativeVersionId();
      file.updateChecksum = fletcher32(contents);

      this.props.connection.send(encodePacket(PacketCode.FileContents) +
        encodeByte(0) + encodeU32(file.remoteChecksum) +
        file.name + "\0" +
        contents);
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

  private onPacket = (event: PacketEvent) => {
    if (event.code === PacketCode.TerminalContents) {
      decode10TerminalChanged(event.message, this.state.terminal);
      this.state.terminalChanged.signal();
    } else if (event.code === PacketCode.FileContents) {
      const packet = decode30FileContents(event.message);
      if (!packet) {
        console.error("Could not decode file contents packet");
        return; // We could log an error, but this'll do.
      }

      const { name, contents, flags } = packet;

      let files = this.state.files;
      let file = files.find(x => x.name === name);
      if (!file) {
        const model = editor.createModel(contents, "lua");

        // Setup some event listeners for this model
        model.text.onDidChangeContent(() => {
          const file = this.state.files.find(x => x.name === name);
          if (!file) return;

          const modified = model.text.getAlternativeVersionId() !== file.savedVersionId;
          if (modified !== file.modified) this.setFileState(file, { modified });
        });

        file = {
          name, model,
          readOnly: (flags & FileOpenFlags.ReadOnly) !== 0,

          remoteChecksum: fletcher32(contents),

          modified: false,
          savedVersionId: model.text.getAlternativeVersionId(),
        };

        files = [...files, file].sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // TODO: Add support for updating
      }

      this.setState({
        files,
        activeFile: (flags & FileOpenFlags.Edit) ? file.name : this.state.activeFile,
      });
    } else if (event.code === PacketCode.FileAccept) {
      const packet = decode31FileAccept(event.message);
      if (!packet) {
        console.error("Received malformed file accept packet");
        return;
      }

      const { name, checksum } = packet;
      const file = this.state.files.find(x => x.name === name);
      if (file) {
        file.remoteChecksum = checksum;

        if (file.updateChecksum === checksum) {
          this.setFileState(file, {
            savedVersionId: file.updateMark!,
            modified: file.model.text.getAlternativeVersionId() !== file.updateMark,

            updateMark: undefined,
            updateChecksum: undefined,
          });

          this.removeFileNotification(file, "update");
        } else {
          this.pushFileNotification(file, NotificationKind.Warn, "update",
            <span>
              <code>{file.name}</code> has been changed, you may want to close and reopen to update it.
            </span>);
        }
      }
    } else if (event.code === PacketCode.FileReject) {
      const packet = decode31FileAccept(event.message);
      if (!packet) {
        console.error("Received malformed file reject packet");
        return;
      }

      const { name, checksum } = packet;
      const file = this.state.files.find(x => x.name === name);
      if (file && file.updateChecksum) {
        this.pushFileNotification(file, NotificationKind.Error, "update",
          <span>
            <code>{file.name}</code> could not be saved as it was changed on the remote client.
          </span>);
      }
    }
  }

  /**
   * Update the state for a given file
   */
  private setFileState<K extends keyof FileInfo>(file: FileInfo, props: Pick<FileInfo, K>) {
    this.setState({
      files: this.state.files.map(x => x !== file ? x : Object.assign({}, x, props)),
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
}
