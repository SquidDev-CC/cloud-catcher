import { JSX, h } from "preact";
import { dialogueBox, formGroup} from "./styles.css";
import { dialogueBox as dark_dialogueBox, formGroup as dark_formGroup} from "./darkStyles.css";
import termFont from "@squid-dev/cc-web-term/assets/term_font.png";
import termFontHd from "@squid-dev/cc-web-term/assets/term_font_hd.png";

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
    update({ ...settings, ...changes });
  }

  return <div class={settings.darkMode ? dark_dialogueBox : dialogueBox}>
    <h2>Settings</h2>
    <h3>Editor settings</h3>
    <div class={settings.darkMode ? dark_formGroup : formGroup}>
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
    <div class={settings.darkMode ? dark_formGroup : formGroup}>
      <label>
        Font style
        <select value={settings.terminalFont}
          onInput={(e: Event) => updateWith({ terminalFont: (e.target as HTMLInputElement).value })} >
          <option value={termFont}>Standard Font</option>
          <option value={termFontHd}>High-definition font</option>
        </select>
      </label>
    </div>

    <h3>General settings</h3>
    <div class={settings.darkMode ? dark_formGroup : formGroup} >
      <label>
        <input type="checkbox" checked={settings.darkMode}
          onInput={(e: Event) => updateWith({ darkMode: (e.target as HTMLInputElement).checked })} />
        Dark Mode
      </label>

      <label>
        <input type="checkbox" checked={settings.terminalBorder}
          onInput={(e: Event) => updateWith({ terminalBorder: (e.target as HTMLInputElement).checked })} />
        Terminal border
      </label>
    </div>
  </div >;
};
