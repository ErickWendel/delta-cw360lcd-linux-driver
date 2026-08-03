export const VENDOR_ID = "33C3";
export const PRODUCT_IDS = new Set(["7788", "7791", "7792"]);
export const BAUD_RATE = 2_000_000;

export function encodeCommand(command, payload = []) {
  const body = Buffer.from(payload);
  const length = body.length + 7;
  const packet = Buffer.concat([
    Buffer.from([0x55, 0xaa, length & 0xff, (length >> 8) & 0xff, command]),
    body,
  ]);
  const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  return Buffer.concat([packet, Buffer.from([checksum & 0xff, (checksum >> 8) & 0xff])]);
}

export function decodeResponse(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 7) throw new Error("response is too short");
  if (packet[0] !== 0x55 || packet[1] !== 0xaa) throw new Error("invalid response header");
  const expectedLength = packet[2] | (packet[3] << 8);
  if (expectedLength !== packet.length) throw new Error(`invalid response length: expected ${expectedLength}, received ${packet.length}`);
  const expectedChecksum = packet.at(-2) | (packet.at(-1) << 8);
  const checksum = packet.subarray(0, -2).reduce((sum, byte) => sum + byte, 0) & 0xffff;
  if (checksum !== expectedChecksum) throw new Error("invalid response checksum");
  const payload = packet.subarray(5, -2);
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch {
    return payload;
  }
}
