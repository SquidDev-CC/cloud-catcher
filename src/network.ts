/**
 * Represents the prefix code a given packet has.
 *
 * 0x System. Only sent from the relay to client or server
 * 1x Terminal
 * 2x Events
 * 3x File system
 *
 * ## Some notes on packet encoding:
 *
 * Most packets are encoded as some form of hexadecimal. Whilst it isn't
 * the most ideal format, (something using binary and b64 might be
 * better), it doesn't appear to have become a problem yet. CC:T does not
 * (yet) support sending binary messages, so we needed some compromise.
 *
 * u8 (unsigned byte)   represented as a 2-digit hexadecimal value
 * u4 (unsigned nibble) represented as a 1-digit hexadecimal value
 * u1 (unsigned bit)    represented as 0 or 1
 * char                 sent encoded as unicode.
 */
export const enum PacketCode {
  /** Sent to viewers when the connection is lost. */
  ConnectionLost = 0x00,

  /**
   * Sent if the channel is considered being "abused". Not currently
   * implemented, but may be used if excessive bandwidth is being
   * used. Alternatively we'll just nuke the channel.
   *
   * ### Payload
   * message: string
   */
  ConnectionAbuse = 0x01,

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
  ConnectionPing = 0x02,

  /**
   * Contains the entire terminal contents
   *
   * ### Payload
   * width:    u8
   * height:   u8
   * cursor_x: u8
   * cursor_y: u8
   * blink:    u1
   * fg:       u4
   * bg:       u4
   *
   * Palettes: 16x
   * red:      u8
   * green:    u8
   * blue:     u8
   *
   * Body:
   * text:     char[width * height]
   * fore:     u4[width * height]
   * back:     u4[width * height]
   */
  TerminalContents = 0x10,

  /**
   * Send a paste event to the host
   *
   * ### Payload
   * message: string
   */
  EventPaste = 0x20,

  /**
   * Send a key event to the host, including the code, and whether it was
   * a press, repeat or release.  May also include the character code, or
   * 0 if not needed.
   *
   * ### Payload
   * kind:   u4 0 represents a press, 1 a release
   * repeat: u1
   * key:    u8
   * char:   string Either a single character or the empty string
   */
  EventKey = 0x21,

  /**
   * Send a mouse event to the host, including x, y, code and whether it
   * was a press, release, drag or scroll
   *
   * ### Payload
   * kind:   u4 0 represents a press, 1 a release, 2 a drag and 3 a scroll
   * button: u4 The button which was pressed. This is used to store scroll direction.
   * x:      u8
   * y:      u8
   */
  EventMouse = 0x22,

  /**
   * Transmit a file from a host to a viewer or vice versa.
   *
   * ### Payload
   * flags :   u4
   * file:     string (null terminated)
   * expected: u32 Stores the checksum we're expecting the remote file to have
   * contents: string
   */
  FileContents = 0x30,

  /**
   * Sent by the host to the viewer(s) marking that a modified file has
   * been accepted.
   *
   * ### Payload
   * new:  u32
   * file: string
   */
  FileAccept = 0x31,

  /**
   * Sent by the host to the viewer(s) marking that a modified file has
   * been rejected.
   *
   * ### Payload
   * new:  u32
   * file: string
   */
  FileReject = 0x32,
}

/**
 * Various modes of operation on transmitting files.
 *
 * This acts as flags, so one may or them together.
 */
export const enum FileOpenFlags {
  /**
   * Force an update of the remote file. This must ignore the expected
   * checksum.
   *
   * If this is not set, then the system will only update the file if the
   * expected checksum matches the current file's contents. If it does
   * not, we may prompt the user, or may send a FileReject packet.
   */
  Force = 0x01,

  /**
   * Open the remote file in an editor. This should only be used when
   * sending to the viewer.
   */
  Edit = 0x02,

  /**
   * Marks that this file is compressed. This will use lzw + base64.
   */
  Compressed = 0x04,

  /**
   * Marks that this file has been opened in read-only mode and so should
   * not be editable. This should only be used when sending to the
   * viewer.
   */
  ReadOnly = 0x08,
}

export const fromViewer = (code: PacketCode) =>
  code === PacketCode.ConnectionPing ||
  code === PacketCode.EventPaste ||
  code === PacketCode.EventKey ||
  code === PacketCode.EventMouse ||
  code === PacketCode.FileContents ||
  false;

export const fromHost = (code: PacketCode) =>
  code === PacketCode.ConnectionPing ||
  code === PacketCode.TerminalContents ||
  code === PacketCode.FileContents ||
  code === PacketCode.FileAccept ||
  code === PacketCode.FileReject ||
  false;

export const encoder = (width: number) => {
  const mins = "0".repeat(width);
  const maxes = "f".repeat(width);

  return (value: number) => {
    if (value <= 0) return mins;
    if (value >= (1 << (width * 4))) return maxes;
    return (mins + value.toString(16)).slice(-width);
  };
};

export const encodePacket = encoder(2);
export const encodeNibble = encoder(1);
export const encodeByte = encoder(2);
export const encodeU32 = (value: number) =>
  // We use >>> as that operates on unsigned integers instead of signed ones
  ("00000000" + (value >>> 0).toString(16)).slice(-8);

/**
 * The maximum size a packet can be. Yes, this is silly, but let's put
 * some vague effort into preventing abuse.
 */
export const MAX_PACKET_SIZE = 16384;
