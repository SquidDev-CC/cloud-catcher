import { h, render } from "preact";
import { checkToken, genToken } from "../token";
import { Main } from "./main";

const queryArgs = window.location.search
  .substring(1).split("&")
  .map(x => x.split("=", 2).map(decodeURIComponent));

const query: { [key: string]: string } = {};
for (const [k, v] of queryArgs) query[k] = v;

// Generate a token ID from the query string or a random number
const token = checkToken(query.id) ? query.id : genToken();

// And start the window!
const page = document.getElementById("page") as HTMLElement;
render(<Main token={token} />, page, page.lastElementChild || undefined);
