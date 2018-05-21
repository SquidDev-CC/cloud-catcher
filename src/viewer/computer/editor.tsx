import * as ace from "ace";
import { Component, h } from "preact";
import { Settings } from "../settings";

export type Model = ace.IEditSession;

export const createModel = (contents: string, mode?: string) => {
  const editor = ace.createEditSession(contents);
  if (mode) editor.setMode(mode);
  return editor;
};

export type EditorProps = {
  // From the main state
  settings: Settings,
  focused: boolean,

  // From the computer session
  model: ace.IEditSession,
  readOnly: boolean,

  // A set of actions to call
  onChanged: (dirty: boolean) => void,
  doSave: (contents: string) => void,
  doClose: () => void,
};

export default class Editor extends Component<EditorProps, {}> {
  private editor?: ace.Editor;

  public componentDidMount() {
    this.editor = ace.edit(this.base);

    this.editor.on("input", () => {
      this.props.onChanged(!this.props.model.getUndoManager().isClean());
    });
    this.editor.commands.addCommand({
      name: "save",
      exec: (e: ace.Editor) => this.props.doSave(e.session.getValue()),
      bindKey: { win: "ctrl-s", mac: "cmd-s" },
    });

    this.syncOptions();
  }

  public componentWillUnmount() {
    if (this.editor) {
      // We set a new session to prevent destroying it when losing the editor
      this.editor.setSession(new ace.EditSession(""));
      this.editor.destroy();
    }
  }

  public componentDidUpdate() {
    if (!this.editor) return;
    this.syncOptions();
  }

  private syncOptions() {
    if (!this.editor) return;
    this.editor.setSession(this.props.model);
    this.editor.setReadOnly(this.props.readOnly);

    this.editor.setOption("tabSize", this.props.settings.tabSize);
    this.editor.setOption("showInvisibles", this.props.settings.showInvisible);

    switch (this.props.settings.editorMode) {
      case "emacs":
        this.editor.setKeyboardHandler("ace/keyboard/emacs");
        break;
      case "vim":
        this.editor.setKeyboardHandler("ace/keyboard/vim");
        (ace as any).config.loadModule("ace/keyboard/vim", (m: any) => {
          m.Vim.defineEx("write", "w", (cm: any) => cm.ace.execCommand("save"));
          m.Vim.defineEx("quit", "q", () => this.props.doClose());
          m.Vim.defineEx("wq", "wq", (cm: any) => { cm.ace.execCommand("save"); this.props.doClose(); });
        });
        break;
      case "boring":
      default:
        this.editor.setKeyboardHandler(null);
        break;
    }

    if (this.props.focused) this.editor.focus();
  }

  public render() {
    return <div class="editor-view"></div>;
  }
}
