const fs = require('node:fs');
const { SerialPort } = require('../work/vendor-app/node_modules/serialport');

const portPath = process.argv[2];
const imagePath = process.argv[3];

if (!portPath || !imagePath) {
  console.error('Usage: show-static-frame.cjs /dev/ttyACM<number> image.jpg');
  process.exit(2);
}

const image = fs.readFileSync(imagePath);
if (image[0] !== 0xff || image[1] !== 0xd8 || image.at(-2) !== 0xff || image.at(-1) !== 0xd9) {
  console.error('The input must be a complete JPEG image.');
  process.exit(2);
}

function encodeCommand(command, payload = []) {
  const body = Buffer.from(payload);
  const length = body.length + 7;
  const packet = Buffer.concat([
    Buffer.from([0x55, 0xaa, length & 0xff, (length >> 8) & 0xff, command]),
    body,
  ]);
  const checksum = packet.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  return Buffer.concat([packet, Buffer.from([checksum & 0xff, checksum >> 8])]);
}

const port = new SerialPort({ path: portPath, baudRate: 2_000_000, autoOpen: false, lock: true });
const responses = [];
port.on('data', (chunk) => responses.push(chunk));
port.on('error', fail);

function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
  if (port.isOpen) port.close();
}

function write(data) {
  return new Promise((resolve, reject) => {
    port.write(data, (error) => {
      if (error) return reject(error);
      port.drain((drainError) => drainError ? reject(drainError) : resolve());
    });
  });
}

port.open(async (error) => {
  if (error) return fail(error);
  try {
    await write(encodeCommand(0x11));
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (let offset = 0; offset < image.length; offset += 20 * 1024) {
      await write(image.subarray(offset, offset + 20 * 1024));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`Sent one static JPEG frame (${image.length} bytes) to ${portPath}.`);
    if (responses.length) console.log(`Device response: ${Buffer.concat(responses).toString('hex')}`);
    port.close();
  } catch (writeError) {
    fail(writeError);
  }
});
