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

export const TokenDisplay = ({ token }: TokenDisplayProps) => {
  return <div class="dialogue-view">
    <h2>Getting started</h2>
    {genSetup(token)}
  </div>;
};

export type LostConnectionProps = {
  token: Token;
};

export const LostConnection = ({ token }: LostConnectionProps) => {
  return <div class="dialogue-view">
    <h2>Connection Lost</h2>
    <p>We've lost our connection to this computer. Maybe try restarting the script:</p>
    {genSetup(token)}
  </div>;
};

export type UnknownErrorProps = {
  error: string;
};

export const UnknownError = ({ error }: UnknownErrorProps) => {
  return <div class="dialogue-view error-view">
    <h2>An error occured</h2>
    <pre>{error}</pre>
  </div>;
};
