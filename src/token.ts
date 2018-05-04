export type Token = string;

/**
 * The length a token must be.
 */
export const TOKEN_LENGTH = 32;

export const genToken = (): Token => {
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    const x = Math.floor(Math.random() * 62);
    if (x < 10) token += String.fromCharCode(x + 48);
    else if (x < 36) token += String.fromCharCode(x - 10 + 65);
    else token += String.fromCharCode(x - 36 + 97);
  }
  return token;
};

export const checkToken = (tok: any): tok is Token =>
  typeof tok === "string" && tok.length === TOKEN_LENGTH && !tok.match(/[^A-Za-z0-9]/);
