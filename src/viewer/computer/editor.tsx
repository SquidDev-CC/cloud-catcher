import * as monaco from "monaco-editor";
import { Component, h } from "preact";
import "../../editor/lua";
import { Settings } from "../settings";

export type Model = {
  text: monaco.editor.ITextModel,
  view: monaco.editor.ICodeEditorViewState | null,
};

export const createModel = (contents: string, mode?: string): Model => {
  // We could specify the path, but then that has to be unique and it introduces all sorts of issues.
  const text = monaco.editor.createModel(contents, mode);
  text.updateOptions({ trimAutoWhitespace: true });
  text.detectIndentation(true, 2);
  return { text, view: null };
};

export type EditorProps = {
  // From the main state
  settings: Settings,
  focused: boolean,

  // From the computer session
  model: Model,
  readOnly: boolean,

  // A set of actions to call
  onChanged: (dirty: boolean) => void,
  doSave: (contents: string) => void,
  doClose: () => void,
};

export default class Editor extends Component<EditorProps, {}> {
  private editor?: monaco.editor.IStandaloneCodeEditor;

  public componentDidMount() {
    window.addEventListener("resize", this.onResize);

    this.editor = monaco.editor.create(this.base!, {
      roundedSelection: false,
      autoIndent: "full",
    });

    this.editor.addAction({
      id: "save",
      label: "Save",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S,
      ],
      contextMenuGroupId: "file",
      contextMenuOrder: 1.5,
      run: editor => {
        if (this.props.settings.trimWhitespace) {
          editor.getAction("editor.action.trimTrailingWhitespace").run();
        }
        this.props.doSave(editor.getValue());
      },
    });

    this.syncOptions();
  }

  public componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);

    if (!this.editor) return;
    // Save the view state back to the model
    if (this.props.model) {
      this.props.model.view = this.editor.saveViewState();
    }

    // We set a new session to prevent destroying it when losing the editor
    this.editor.dispose();
  }

  public componentWillUpdate() {
    // Save the view state back to the model
    if (this.editor && this.props.model) {
      this.props.model.view = this.editor.saveViewState();
    }
  }

  public componentDidUpdate() {
    if (!this.editor) return;
    this.syncOptions();
  }

  private syncOptions() {
    if (!this.editor) return;
    const { settings, model, readOnly } = this.props;

    this.editor.setModel(model.text);
    if (model.view) this.editor.restoreViewState(model.view);

    this.editor.updateOptions({
      renderWhitespace: settings.showInvisible ? "boundary" : "none",
      readOnly,
    });

    monaco.editor.setTheme(settings.darkMode ? "vs-dark" : "vs");

    // TODO: Tab size, trim auto whitespace

    if (this.props.focused) this.editor.focus();
  }

  public render() {
    return <div class="editor-view"></div>;
  }

  /**
   * When the window resizes, we also need to update the editor's dimensions.
   */
  private onResize = () => this.editor?.layout();
}
