import { Fragment } from "./diff";

/**
 * This represents the capabilities a client has. The server can be thought of a
 * monolithic entity which has all the capabilities its clients provide.
 */
export const enum Capability {
  /**
   * Responsible for broadcasting the terminal state to other computers, accepts
   * events from any terminal viewer.
   *
   * There can be at most one terminal host connected to the system.
   */
  TerminalHost = "terminal:host",

  /**
   * Receives terminal information from a host and responds with events.
   *
   * There can be 0..∞ terminal viewers connected to the system. The terminal
   * host should only be broadcasting if there is at least one viewer.
   */
  TerminalView = "terminal:view",

  /**
   * This exposes a file system and operations on the file system.
   */
  FileHost = "file:host",

  /**
   * This is a lightweight version of FileHost, which is capable of editing
   * files but does not provide a full filesystem.
   */
  FileEdit = "file:edit",
}

export const checkCapability = (cap: any): cap is Capability => {
  if (typeof cap !== "string") return false;
  return cap === Capability.TerminalHost ||
    cap === Capability.TerminalView ||
    cap === Capability.FileHost ||
    cap === Capability.FileEdit ||
    false;
};

/**
 * Represents the prefix code a given packet has.
 *
 * 0x System. Only sent from the relay to client or server
 * 1x Terminal
 * 2x Files
 */
export const enum PacketCode {
  ConnectionUpdate = 0x00,
  ConnectionAbuse = 0x01,
  ConnectionPing = 0x02,

  TerminalContents = 0x10,
  TerminalPaste = 0x11,
  TerminalKey = 0x12,
  TerminalMouse = 0x13,

  FileListing = 0x20,
  FileRequest = 0x21,
  FileAction = 0x22,
  FileConsume = 0x23,
}

export type Packet
  = PacketConnectionUpdate
  | PacketConnectionAbuse
  | PacketConnectionPing
  | PacketTerminalContents
  | PacketTerminalPaste
  | PacketTerminalKey
  | PacketTerminalMouse
  | PacketFileListing
  | PacketFileReqeust
  | PacketFileAction
  | PacketFileConsume;

/**
 * Sent to clients when the connection changes state. This contains a union of
 * all other client's capabilities, which can be used to determine what
 * functionality should be enabled.
 */
export type PacketConnectionUpdate = {
  packet: PacketCode.ConnectionUpdate,

  /** The number of connected clients. */
  clients: number,
  /** Set of active capabilities on the server */
  capabilities: Capability[],
};

/**
 * Sent if the channel is considered being "abused". Not currently
 * implemented, but may be used if excessive bandwidth is being
 * used. Alternatively we'll just nuke the channel.
 */
export type PacketConnectionAbuse = {
  packet: PacketCode.ConnectionAbuse,
  message: string,
};

/**
 * Sent from the server to any client to ensure it's still
 * connected. Whilst websockets have their own ping/pong system, CC
 * doesn't handle it correctly (I wonder who is to blame for that).
 *
 * Further more, if a CC program crashes, the websocket will not be
 * closed. Thus we must have our own ping packet. In this case, we only
 * care if the client is up, so we can just get the client to return
 * another ping.
 */
export type PacketConnectionPing = {
  packet: PacketCode.ConnectionPing,
};

/**
 * Contains the entire terminal contents, sent from the terminal host to any
 * number of viewers.
 */
export type PacketTerminalContents = {
  packet: PacketCode.TerminalContents,

  width: number,
  height: number,
  cursorX: number, cursorY: number, cursorBlink: boolean,
  curFore: string, curBack: string,

  palette: number[][],

  text: string[],
  fore: string[],
  back: string[],
};

/**
 * Send a paste event to the terminal host
 */
export type PacketTerminalPaste = {
  packet: PacketCode.TerminalPaste,

  contents: string,
};

/**
 * Send a paste event to the terminal host
 * Send a key event to the host, including the code, and whether it was
 * a press, repeat or release.  May also include the character code, or
 * 0 if not needed.
 */
export type PacketTerminalKey = {
  packet: PacketCode.TerminalKey,

  /** 0 = press, 1 = repeat, 2 = release */
  kind: 0 | 1 | 2, // TODO: Enum.
  code: number,
  /** Either a single character or the empty string */
  char: string,
};

export type PacketTerminalMouse = {
  packet: PacketCode.TerminalMouse;

  /** 0 = press, 1 = release, 2 = drag, 3 = scroll */
  kind: 0 | 1 | 2 | 3, // TODO: Enum
  /** The button which was pressed or the scroll direction */
  button: number,
  x: number, y: number,
};

export type FileEntry = {
  /** The name of this file */
  file: string,

  /** The checksum of this file, or 0 if it is a directory */
  checksum: number,
};
/**
 * Transmits a set of files and their checksums which this file host is
 * interested in exposing.
 *
 * Other hosts accept this and may either request or replace existing files.
 */
export type PacketFileListing = {
  packet: PacketCode.FileListing,

  /*
   * The client to send this listing to (or 0 if it should be broadcast). The
   * receiving clients will receive the transmitting id instead.
   */
  id: number,

  /** The files being listed */
  files: FileEntry[],
};

/**
 * Requests one or more files from a host.
 */
export type PacketFileReqeust = {
  packet: PacketCode.FileRequest,

  /*
   * The client to send this request to. This cannot be 0.  Receiving clients
   * will receive the transmitting id instead.
   */
  id: number,

  /** The files being listed. */
  file: FileEntry[],
};

// TODO: Add docs back
export const enum FileActionFlags {
  ReadOnly = 0x1,

  Force = 0x2,
  Open = 0x4,
}

export const enum FileAction {
  /**
   * Replace the file's contents with this packet's contents
   */
  Replace = 0x0,

  /**
   * Patch the file's contents with this packet's contents.  The patch format
   * is split into chunks as follows:
   *
   * Keep:
   * 0:      u4
   * length: u16
   *
   * Delete
   * 1       u4
   * Length: u16
   *
   * Insert
   * 2       u4
   * Length: string
   */
  Patch = 0x1,

  /**
   * Delete this file or folder.
   */
  Delete = 0x2,
}

export type FileActionEntry = FileEntry & { flags: FileActionFlags } &
  ({ action: FileAction.Delete }
    | { action: FileAction.Patch, delta: Fragment[] }
    | { action: FileAction.Replace, contents: string });

/**
 * Sends one or more files from one client to another.
 */
export type PacketFileAction = {
  packet: PacketCode.FileAction,

  /**
   * The client to send these files to (or 0 if it should be broadcast). The
   * receiving clients will receive the transmitting id instead.
   */
  id: number,

  actions: FileActionEntry[],
};

export const enum FileConsume {
  /** This file was consumed correctly */
  OK = 0x1,

  /** This file was rejected due to a mismatched checksum */
  Reject = 0x2,

  /** This file matched but could not be updated */
  Failure = 0x3,
}
/*
   * Sent by the host to the viewer(s) marking that a set of file actions has
   * been received.
   */

export type PacketFileConsume = {
  packet: PacketCode.FileConsume,

  /*
   * The client which set the file actions. The receiving client will receive
   * the transmitting id instead.
   */
  id: number,

  files: Array<FileEntry & { result: FileConsume }>,
};

export const allowedFrom = (code: PacketCode, capabilities: Set<Capability>) => {
  switch (code) {
    case PacketCode.ConnectionUpdate: return false;
    case PacketCode.ConnectionPing: return true;
    case PacketCode.ConnectionAbuse: return false;

    case PacketCode.TerminalContents: return capabilities.has(Capability.TerminalHost);
    case PacketCode.TerminalKey:
    case PacketCode.TerminalMouse:
    case PacketCode.TerminalPaste:
      return capabilities.has(Capability.TerminalView);

    case PacketCode.FileAction:
    case PacketCode.FileConsume:
    case PacketCode.FileRequest:
      return capabilities.has(Capability.FileHost) || capabilities.has(Capability.FileEdit);
    case PacketCode.FileListing:
      return capabilities.has(Capability.FileHost);

    default:
      return false;
  }
};

/**
 * The maximum size a packet can be. Yes, this is silly, but let's put
 * some vague effort into preventing abuse.
 */
export const MAX_PACKET_SIZE = 16384;

export const encodePacket = (packet: Packet) => JSON.stringify(packet);
export const decodePacket = (message: string) => {
  try {
    const packet = JSON.parse(message);
    if (typeof packet !== "object"
      || typeof packet.packet !== "number" || !Number.isInteger(packet.packet)) {
      return null;
    }

    return packet as Packet;
  } catch { /*ignore */ }
  return null;
};
