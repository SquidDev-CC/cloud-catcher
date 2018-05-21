import * as monaco from "monaco-editor";
import { configuration, tokens } from "./grammar";

monaco.languages.register({
  id: "luax",
  aliases: ["LuaX", "LuaX", "luax"],
  extensions: [".lua"],
});

monaco.languages.setLanguageConfiguration("luax", configuration);
monaco.languages.setMonarchTokensProvider("luax", tokens);
