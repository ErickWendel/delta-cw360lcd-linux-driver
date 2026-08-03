const { SerialPort } = require('../work/vendor-app/node_modules/serialport');

const portPath = process.argv[2] || 'COM4';
const request = Buffer.from([0x55, 0xaa, 0x07, 0x00, 0x06, 0x0c, 0x01]);
const port = new SerialPort({ path: portPath, baudRate: 2_000_000, autoOpen: false, lock: true });
let response = Buffer.alloc(0);

const timer = setTimeout(() => finish(new Error('Timed out waiting for device information')), 3000);

function finish(error) {
  clearTimeout(timer);
  const closeAndExit = () => {
    if (error) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      console.log(`Response (${response.length} bytes): ${response.toString('hex')}`);
      const jsonStart = response.indexOf(0x7b);
      const jsonEnd = response.lastIndexOf(0x7d);
      if (jsonStart !== -1 && jsonEnd >= jsonStart) {
        try { console.log(JSON.stringify(JSON.parse(response.subarray(jsonStart, jsonEnd + 1)), null, 2)); } catch {}
      }
    }
  };
  if (port.isOpen) port.close(closeAndExit); else closeAndExit();
}

port.on('data', (chunk) => {
  response = Buffer.concat([response, chunk]);
  if (response.length >= 4) {
    const expected = response.readUInt16LE(2);
    if (expected >= 7 && response.length >= expected) finish();
  }
});
port.on('error', finish);
port.open((error) => {
  if (error) return finish(error);
  port.write(request, (writeError) => writeError ? finish(writeError) : port.drain((drainError) => drainError && finish(drainError)));
});
