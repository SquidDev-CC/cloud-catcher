import { Component, h } from "preact";

export type Settings = {
  // Editor Settings
  editorMode: "boring" | "vim" | "emacs",
  showInvisible: boolean,
  trimWhitespace: boolean,
  tabSize: number,

  // General settings
  darkMode: boolean,
  terminalBorder: boolean,
};

export type SettingsProperties = {
  settings: Settings,
  update: (changes: Settings) => void,
};


export const Settings = ({ settings, update }: SettingsProperties): JSX.Element => {
  function updateWith<K extends keyof Settings>(changes: Pick<Settings, K>) {
    update(Object.assign({}, settings, changes));
  }

  return <div class="settings-box dialogue-box">
    <h2>Settings</h2>
    <h3>Editor settings</h3>
    <div class="form-group">
      <label>
        <input type="checkbox" checked={settings.showInvisible} onInput={(e: Event) => updateWith({ showInvisible: (e.target as HTMLInputElement).checked })} />
        Show whitespace
      </label>

      <label>
        <input type="checkbox" checked={settings.trimWhitespace} onInput={(e: Event) => updateWith({ trimWhitespace: (e.target as HTMLInputElement).checked })} />
        Trim whitespace
      </label>

      <label>
        {/* TODO: Add some argument validation here. */}
        Tab size
        <input type="number" min="1" value={`${settings.tabSize}`} onInput={(e: Event) => updateWith({ tabSize: parseInt((e.target as HTMLInputElement).value) })} />
      </label>

      <label>
        {/* TODO: Add some argument validation here. */}
        Editor mode
        <select value={settings.editorMode} onInput={(e: Event) => updateWith({ editorMode: (e.target as HTMLInputElement).value as any })}>
          <option value="boring">Boring</option>
          <option value="vim" >Vim</option>
          <option value="emacs" >Emacs</option>
        </select>
      </label>
    </div>

    <h3>General settings</h3>
    <div class="form-group" >
      <label>
        <input type="checkbox" checked={settings.darkMode} onInput={(e: Event) => updateWith({ darkMode: (e.target as HTMLInputElement).checked })} />
        Dark Mode
        {settings.darkMode ? <span class="tiny-text"> Nope, not happening</span> : ""}
      </label>

      <label>
        <input type="checkbox" checked={settings.terminalBorder} onInput={(e: Event) => updateWith({ terminalBorder: (e.target as HTMLInputElement).checked })} />
        Terminal border
      </label>
    </div>
  </div >;
};
