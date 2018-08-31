import { h } from "preact";
import { Token } from "../token";

export type TokenDisplayProps = {
  token: Token;
};

const genSetup = (token: string) =>
  <pre>
    <span class="term-line">wget {window.location.origin}/cloud.lua cloud.lua</span>
    {"\n"}
    <span class="term-line">cloud.lua {token}</span>
  </pre>;

const githubLink =
  <div class="info-description">
    <p>
      Think you've found a bug? Have a suggestion? Why not put it
      on <a href="https://github.com/SquidDev-CC/cloud-catcher" title="CloudCatcher's GitHub repository">the GitHub repo</a>?
    </p>
  </div>;

export const TokenDisplay = ({ token }: TokenDisplayProps) =>
  <div class="info-container">
    <div class="info-view">
      <h2>Getting started</h2>
      {genSetup(token)}
    </div>
    <div class="info-description">
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
        <li><a href="https://minecraft.curseforge.com/projects/cc-tweaked">CC: Tweaked</a></li>
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
      </ul>
    </div>
  </div>;

export type LostConnectionProps = {
  token: Token;
};

export const LostConnection = ({ token }: LostConnectionProps) =>
  <div class="info-container">
    <div class="info-view">
      <h2>Connection Lost</h2>
      <p>We've lost our connection to this computer. Maybe try restarting the script:</p>
      {genSetup(token)}
    </div>
    {githubLink}
  </div>;

export type UnknownErrorProps = {
  error: string;
};

export const UnknownError = ({ error }: UnknownErrorProps) =>
  <div class="info-container">
    <div class="info-view error-view">
      <h2>An error occured</h2>
      <pre>{error}</pre>
    </div>
    {githubLink}
  </div>;
