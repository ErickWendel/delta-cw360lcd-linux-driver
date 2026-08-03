import assert from "node:assert/strict";
import test from "node:test";
import { decodeResponse, encodeCommand } from "../scripts/delta-protocol.mjs";

test("encodes the Delta device-info command", () => {
  assert.equal(encodeCommand(0x06).toString("hex"), "55aa0700060c01");
});

test("encodes payload length and additive checksum", () => {
  assert.equal(encodeCommand(0x03, [42]).toString("hex"), "55aa0800032a3401");
});

test("decodes a JSON response", () => {
  const json = Buffer.from('{"width":480,"height":320}', "utf8");
  const packet = encodeCommand(0x06, json);
  assert.deepEqual(decodeResponse(packet), { width: 480, height: 320 });
});

test("rejects truncated and corrupt responses", () => {
  assert.throws(() => decodeResponse(Buffer.from([0x55, 0xaa])), /too short/);
  const packet = encodeCommand(0x06, Buffer.from("{}"));
  packet[5] ^= 0xff;
  assert.throws(() => decodeResponse(packet), /checksum/);
});
