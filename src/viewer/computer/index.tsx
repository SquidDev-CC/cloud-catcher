import { Component, h } from "preact";
import { FileOpenFlags, PacketCode, encodeByte, encodePacket, encodeU32 } from "../../network";
import { Token } from "../../token";
import { BufferingEventQueue, PacketEvent, Semaphore } from "../event";
import { decode10TerminalChanged, decode30FileContents, decode31FileAccept, fletcher32 } from "../packet";
import { Terminal } from "../terminal/component";
import { TerminalData } from "../terminal/data";
import Editor, * as editor from "./editor";

type FileInfo = {
  name: string,
  model: editor.Model,

  remoteChecksum: number,
  updateChecksum?: number,
  updateMark?: number,

  modified: boolean,
  readOnly: boolean,
};

export type ComputerProps = {
  connection: WebSocket,
  events: BufferingEventQueue<PacketEvent>,
  token: Token,
};

type ComputerState = {
  activeFile: FileInfo | null,
  files: FileInfo[],
  terminal: TerminalData,
  terminalChanged: Semaphore,
};

export class Computer extends Component<ComputerProps, ComputerState> {
  public constructor(props: ComputerProps, context: any) {
    super(props, context);

    this.state = {
      activeFile: null,
      files: [],
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

  public render({ connection, token }: ComputerProps, { activeFile, files, terminal, terminalChanged }: ComputerState) {
    const fileList = files.map(x => {
      const fileClasses = "file-entry" + (x === activeFile ? " active" : "");
      const iconClasses = "file-icon"
        + (x.modified ? " file-icon-modified" : "")
        + (x.readOnly ? " file-icon-readonly" : "");
      const iconLabels = "Close editor" + (x.readOnly ? " (read only)" : "");

      let name = x.name;
      if (name.charAt(0) !== "/") name = "/" + name;
      const sepIndex = name.lastIndexOf("/");
      return <div key={x.name} class={fileClasses} onClick={this.createSelectFile(x)}>
        <div class={iconClasses} title={iconLabels} onClick={this.createClose(x)}></div>
        <div class="file-name">{name.substr(sepIndex + 1)}</div>
        <div class="file-info">{name.substr(0, sepIndex + 1)}</div>
      </div>;
    });

    const computerClasses = "file-entry file-computer" + (activeFile === null ? " active" : "");
    const target = `${window.location.origin}/?id=${this.props.token}`;
    return <div class="computer-view">
      <div class="file-list">
        <div class={computerClasses} onClick={this.createSelectFile(null)}>
          <div class="file-name">Remote files</div>
          <div class="file-info">
            <a href={target} title="Get a shareable link of this session token" onClick={this.onClickToken}>{token}</a>
          </div>
        </div>
        {fileList}
      </div>
      {activeFile == null
        ? <Terminal terminal={terminal} changed={terminalChanged} connection={connection} />
        : <Editor model={activeFile.model} readOnly={activeFile.readOnly}
          onChanged={this.onChanged} onSave={this.onSave} />}
    </div>;
  }

  private createSelectFile(file: FileInfo | null) {
    return (e: Event) => {
      e.stopPropagation();
      this.setState({ activeFile: file });
    };
  }

  private createClose(file: FileInfo) {
    return (e: Event) => {
      e.stopPropagation();
      this.setState({
        files: this.state.files.filter(x => x !== file),
        activeFile: this.state.activeFile === file ? null : this.state.activeFile,
      });
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

  private onChanged = (dirty: boolean) => {
    const fileInfo = this.state.activeFile;
    if (fileInfo && dirty !== fileInfo.modified) {
      fileInfo.modified = dirty;
      // So technically we should do an immuable copy of it all,
      // but at this point it really isn't worth it.
      this.setState({});
    }
  }

  private onSave = (contents: string) => {
    const fileInfo = this.state.activeFile;
    if (fileInfo && !fileInfo.readOnly) {
      fileInfo.updateMark = fileInfo.model.getUndoManager().getRevision();
      fileInfo.updateChecksum = fletcher32(contents);

      this.props.connection.send(encodePacket(PacketCode.FileContents) +
        encodeByte(0) + encodeU32(fileInfo.remoteChecksum) +
        fileInfo.name + "\0" +
        contents);
    }
  }

  private onPacket = (event: PacketEvent) => {
    if (event.code === PacketCode.TerminalContents) {
      decode10TerminalChanged(event.message, this.state.terminal);
      this.state.terminalChanged.signal();
    } else if (event.code === PacketCode.FileContents) {
      const file = decode30FileContents(event.message);
      if (!file) {
        console.error("Could not decode file contents packet");
        return; // We could log an error, but this'll do.
      }

      const { name, contents, flags } = file;

      let fileList = this.state.files;
      let fileInfo = fileList.find(x => x.name === name);
      if (!fileInfo) {
        const model = editor.createModel(contents, "ace/mode/lua");

        fileInfo = {
          name, model,

          remoteChecksum: fletcher32(contents),

          modified: false,
          readOnly: (flags & FileOpenFlags.ReadOnly) !== 0,
        };
        fileList = [...fileList, fileInfo].sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // TODO: Add support for updating
      }

      this.setState({
        files: fileList,
        activeFile: (flags & FileOpenFlags.Edit) ? fileInfo : this.state.activeFile,
      });
    } else if (event.code === PacketCode.FileAccept) {
      const file = decode31FileAccept(event.message);
      if (!file) return;

      const { name, checksum } = file;
      const fileInfo = this.state.files.find(x => x.name === name);
      if (fileInfo) {
        fileInfo.remoteChecksum = checksum;
        if (fileInfo.updateChecksum === checksum) {
          fileInfo.model.getUndoManager().bookmark(fileInfo.updateMark);

          fileInfo.modified = !fileInfo.model.getUndoManager().isClean();
          fileInfo.updateMark = undefined;
          fileInfo.updateChecksum = undefined;

          this.setState({});
        }
      }
    }
  }
}
