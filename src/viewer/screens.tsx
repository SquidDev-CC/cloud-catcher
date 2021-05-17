import { h } from "preact";
import type { Token } from "../token";
import { errorView, infoContainer, infoDescription, infoView, termLine } from "./styles.css";

export type TokenDisplayProps = {
  token: Token,
};

const genSetup = (token: string) =>
  <div>
    <pre>
      <span class={termLine}>wget {window.location.origin}/cloud.lua</span>
      {"\n"}
      <span class={termLine}>cloud.lua {token}</span>
    </pre>
  </div>;

const githubLink =
  <div class={infoDescription}>
    <p>
      Think you've found a bug? Have a suggestion? Why not put it
      on <a href="https://github.com/SquidDev-CC/cloud-catcher"
        title="CloudCatcher's GitHub repository">the GitHub repo</a>?
    </p>
  </div>;

export const TokenDisplay = ({ token }: TokenDisplayProps) =>
  <div class={infoContainer}>
    <div class={infoView}>
      <h2>Getting started</h2>
      {genSetup(token)}
    </div>
    <div class={infoDescription}>
      <h3>What is Cloud Catcher?</h3>
      <p>
        Cloud Catcher is a web terminal for ComputerCraft, allowing you to
        interact with any in-game computer in the browser, as well as edit files
        remotely!
      </p>
      <p>
        For more information, as well as source code and screenshots, see
        the <a href="https://github.com/SquidDev-CC/cloud-catcher">GitHub repository</a>.
      </p>
      <h3>Getting started</h3>
      <p>You will require:</p>
      <ul>
        <li>An internet connection</li>
        <li><a href="https://minecraft.curseforge.com/projects/cc-tweaked">CC: Tweaked for Forge</a> or <a href="https://github.com/Merith-TK/cc-restitched">CC: Restitched for Fabric</a></li>
      </ul>
      <p>
        Then just follow the instructions at the top!
      </p>
      <h3>Some little tips</h3>
      <p>
        The <code>cloud.lua</code> program can be run with <code>--help</code> to
        see a full list of options, but here's a look at some of the highlights:
      </p>
      <ul>
        <li><code>cloud -tnone TOKEN</code> Don't show the terminal remotely</li>
        <li>
          <code>cloud -t80x30 TOKEN</code> Use a terminal 80 characters wide and
          30 high. Note this will hide the terminal on the local computer.
        </li>
        <li>Use <code>cloud edit FILE</code> to edit a file within your browser</li>
        <li>
          Click your token in the top-left corner in order to create a link to
          this session. This can be shared with friends, to allow multiple
          people to view your computer!
        </li>
      </ul>
    </div>
  </div>;

export type LostConnectionProps = {
  token: Token,
};

export const LostConnection = ({ token }: LostConnectionProps) =>
  <div class={infoContainer}>
    <div class={infoView}>
      <h2>Connection Lost</h2>
      <p>We've lost our connection to this computer. Maybe try restarting the script:</p>
      {genSetup(token)}
    </div>
    {githubLink}
  </div>;

export type UnknownErrorProps = {
  error: string,
};

export const UnknownError = ({ error }: UnknownErrorProps) =>
  <div class={infoContainer}>
    <div class={`${infoView} ${errorView}`}>
      <h2>An error occured</h2>
      <pre>{error}</pre>
    </div>
    {githubLink}
  </div>;
