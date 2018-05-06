import * as ace from "ace";
import { Component, h } from "preact";

export type Model = ace.IEditSession;

export const createModel = (contents: string, mode?: string) => {
  const editor = ace.createEditSession(contents);
  if (mode) editor.setMode(mode);
  return editor;
};

export type EditorProps = {
  model: ace.IEditSession,
  readOnly: boolean,

  onChanged: (dirty: boolean) => void,
  onSave: (contents: string) => void,
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
      exec: (e: ace.Editor) => this.props.onSave(e.session.getValue()),
      bindKey: { win: "ctrl-s", mac: "cmd-s" },
    });

    // Soon
    // this.editor.setKeyboardHandler("ace/keyboard/vim");

    this.editor.setSession(this.props.model);
    this.editor.setReadOnly(this.props.readOnly);
    this.editor.focus();
  }

  public componentWillUnmount() {
    if (this.editor) {
      // We set a new session to prevent destroying it when losing the editor
      this.editor.setSession(new ace.EditSession(""));
      this.editor.destroy();
    }
  }

  public componentDidUpdate() {
    if (this.editor) {
      this.editor.setSession(this.props.model);
      this.editor.setReadOnly(this.props.readOnly);
      this.editor.focus();
    }
  }

  public render() {
    return <div class="editor-view"></div>;
  }
}
