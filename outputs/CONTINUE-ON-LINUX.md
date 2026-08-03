# Continue the Delta CW360LCD work on Linux

## Important state

The portable runtime archive is self-contained. The original Windows Delta Center installer and `C:\Program Files\DELTA CENTRO` are **not required** after these output files have been copied elsewhere. The archive contains the imported Delta Center 2.0.11 `app.asar`, external `resources/main` files, Electron 37.9.0 Linux runtime, and Linux native modules.

Keep a second copy of the entire output directory before formatting the Windows installation. This private compatibility build contains Delta's proprietary compiled UI and must not be publicly redistributed.

## First Bazzite test

Run the installer described in `BAZZITE-README.md`, unplug/reconnect the cooler, and launch from a terminal for the first test:

```bash
~/.local/opt/delta-center/delta-center-launch 2>&1 | tee ~/delta-center-first-run.log
```

Confirm discovery and permissions in another terminal:

```bash
lsusb -d 33c3:
ls -l /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
udevadm info --attribute-walk --name=/dev/ttyACM0 | grep -Ei 'idVendor|idProduct'
```

The expected cooler identity is VID `33c3`, PID `7791`; Linux may expose it as `/dev/ttyACM0`, `/dev/ttyUSB0`, or another numbered device.

## What was changed

- Repackaged user-supplied Delta Center 2.0.11 in Electron 37.9.0 for Linux x64.
- Retained bundled Linux builds of `serialport`, `node-hid`, and `usb` and unpacked native `.node` files.
- Replaced the Windows `SystemInfos.exe` sensor path with a best-effort Linux provider using `/proc`, `/sys`, `df`, optional `sensors -j`, and optional `nvidia-smi`.
- Prevented Linux from importing the Windows-only shared-memory addon (`mmap-io`).
- Replaced relevant Windows path construction, startup registration, and FFmpeg executable selection.
- Disabled vendor updater/network services unless explicitly enabled on Windows.
- Added rootless `tty` and `hidraw` udev access for Delta PIDs `7788`, `7791`, and `7792`.

## Protocol notes

- Serial speed: `2,000,000` baud.
- Frame: `55 AA`, little-endian total length, command byte, payload, additive 16-bit checksum in little-endian order.
- Read-only device information command: `0x06`.
- Device-info request used during development: `55 aa 07 00 06 0c 01`.
- Live mode command observed: `0x11`.
- Brightness command observed: `0x03`.
- Do not experiment with firmware, serial-number, or undocumented write commands.

## Validation status

Completed on Windows before migration:

- Deterministic import and Linux patch application.
- Four protocol framing/parser unit tests.
- Verified patched files inside the final `app.asar`.
- Verified Linux x64 serial native modules are present.
- Verified the portable archive and installer shell syntax.

Not yet possible before migration:

- Starting the GUI under an actual Linux kernel/display server.
- Opening the cooler from Linux and streaming a frame.
- The Windows read-only query could not open COM4 because the running Delta Center processes owned the port.

## Continuing with Codex on Bazzite

Copy `delta-center-linux-handoff-source.zip` along with the runtime files. Extract it into a working directory. Start a Codex task there and provide this prompt:

> Continue the Delta CW360LCD Bazzite compatibility work. Read CONTINUE-ON-LINUX.md first. The private runtime is already installed. Diagnose the first-run log, test USB serial discovery safely using command 0x06, then test a static frame. Do not send firmware, serial-number, or other destructive commands.

If the UI starts but cannot find the cooler, preserve these outputs for the next task:

```bash
lsusb -v -d 33c3:7791 > ~/delta-lsusb.txt
udevadm info --export-db | grep -i -A20 -B5 33c3 > ~/delta-udev.txt
journalctl --user -b --no-pager | grep -iE 'delta|electron|serial|hidraw' > ~/delta-journal.txt
```

## Recovering the imported application without Windows

The installed application archive is:

```text
~/.local/opt/delta-center/resources/app.asar
```

It can be extracted later with `@electron/asar`. The Windows installation is not needed for further patching as long as the runtime archive or installed directory is preserved.
