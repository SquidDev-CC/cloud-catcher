import { h } from "preact";

export type Settings = {
  // Editor Settings
  showInvisible: boolean,
  trimWhitespace: boolean,

  // Terminal settings
  terminalFont: string,

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
        <input type="checkbox" checked={settings.showInvisible}
          onInput={(e: Event) => updateWith({ showInvisible: (e.target as HTMLInputElement).checked })} />
        Show whitespace
      </label>

      <label>
        <input type="checkbox" checked={settings.trimWhitespace}
          onInput={(e: Event) => updateWith({ trimWhitespace: (e.target as HTMLInputElement).checked })} />
        Trim whitespace
      </label>
    </div>

    <h3>Terminal settings</h3>
    <div class="form-group">
      <label>
        Font style
        <select value={settings.terminalFont}
          onInput={(e: Event) => updateWith({ terminalFont: (e.target as HTMLInputElement).value })} >
          <option value="assets/term_font.png">Standard Font</option>
          <option value="assets/term_font_hd.png">High-definition font</option>
        </select>
      </label>
    </div>

    <h3>General settings</h3>
    <div class="form-group" >
      <label>
        <input type="checkbox" checked={settings.darkMode}
          onInput={(e: Event) => updateWith({ darkMode: (e.target as HTMLInputElement).checked })} />
        Dark Mode
        {settings.darkMode
          ? <span class="tiny-text">Only the editor currently, feel free to PR some fancy CSS.</span>
          : ""}
      </label>

      <label>
        <input type="checkbox" checked={settings.terminalBorder}
          onInput={(e: Event) => updateWith({ terminalBorder: (e.target as HTMLInputElement).checked })} />
        Terminal border
      </label>
    </div>
  </div >;
};
