# Homebridge Aurelux

Puts Aurelux Bluetooth string lights (sold by Brightown, Minetom and others, Bluetooth name `IOTBT…`) in Apple Home:

- **One color light** with on/off, brightness and color.
- **Scene switches** for the app's built-in multi-color scenes, such as Christmas 1–3 and Candy Cane. You can pick up to 42 in the settings.

## Requirements

- The Homebridge host needs a Bluetooth adapter within about 30 ft of the lights.
- In Docker, run Homebridge with `network_mode: host` and `cap_add: [NET_ADMIN, NET_RAW]`.
- Only one device can connect to the lights at a time. The plugin disconnects after 30 seconds idle so the Aurelux app still works.

## Setup

1. Find the lights' Bluetooth name (for example `IOTBT1A2B`) with the nRF Connect app.
2. Add the accessory in the Homebridge UI, or in `config.json`:

```json
{
  "accessory": "Aurelux",
  "name": "Christmas Lights",
  "deviceName": "IOTBT1A2B",
  "scenes": ["Christmas 1", "Christmas 2", "Christmas 3", "Candy Cane"]
}
```

## Limits

- Changes made with the remote or the Aurelux app don't show up in Home.
- Scenes play at the app's default speed and brightness.

## Credits

The protocol and scene payloads come from [8none1/lednetwf_ble](https://github.com/8none1/lednetwf_ble) (MIT). They're based on a capture of the Aurelux app in issue #126.
