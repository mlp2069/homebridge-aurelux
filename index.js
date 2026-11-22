'use strict';
const noble = require('@abandonware/noble');
const { wrap, power, color, scene, SCENES } = require('./packets');

const IDLE_MS = 30000; // disconnect when idle so the Aurelux phone app can connect too
const DEFAULT_SCENES = ['Christmas 1', 'Christmas 2', 'Christmas 3', 'Candy Cane'];

const timeout = (ms, what) => new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms));

class AureluxLights {
  constructor(log, config, api) {
    this.log = log;
    this.hap = api.hap;
    this.deviceName = config.deviceName;
    // shortcut: state is what Home last set; remote/app changes (ff02 notifications) aren't parsed, add that if it matters.
    this.state = { on: false, hue: 0, sat: 0, bri: 100 };
    this.seq = 0;
    this.queue = Promise.resolve();
    const { Service, Characteristic } = api.hap;
    this.On = Characteristic.On;
    if (!this.deviceName) log.error('Set "deviceName" (for example IOTBT1A2B) in the config.');

    this.info = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'Aurelux')
      .setCharacteristic(Characteristic.Model, 'IOTBT string lights')
      .setCharacteristic(Characteristic.SerialNumber, this.deviceName || 'unknown');

    this.light = new Service.Lightbulb(config.name);
    this.light.getCharacteristic(this.On)
      .onGet(() => this.state.on)
      .onSet(async (on) => {
        this.state.on = on;
        await this.send(power(on));
      });
    for (const [c, key] of [[Characteristic.Brightness, 'bri'], [Characteristic.Hue, 'hue'], [Characteristic.Saturation, 'sat']]) {
      this.light.getCharacteristic(c)
        .onGet(() => this.state[key])
        .onSet((v) => {
          this.state[key] = v;
          // Home sends hue and saturation as separate writes; send one packet for both.
          clearTimeout(this.colorTimer);
          this.colorTimer = setTimeout(() => this.sendColor().catch(() => {}), 100);
        });
    }

    this.switches = (config.scenes || DEFAULT_SCENES).filter((n) => SCENES[n]).map((n) => {
      const sw = new Service.Switch(n, n);
      sw.addOptionalCharacteristic(Characteristic.ConfiguredName);
      sw.setCharacteristic(Characteristic.ConfiguredName, n);
      sw.getCharacteristic(this.On).onSet(async (on) => {
        if (!on) return this.sendColor();
        this.scenesOff(sw);
        this.markOn();
        await this.send(scene(n));
      });
      return sw;
    });
  }

  getServices() {
    return [this.info, this.light, ...this.switches];
  }

  scenesOff(keep) {
    for (const sw of this.switches) if (sw !== keep) sw.updateCharacteristic(this.On, false);
  }

  markOn() {
    this.state.on = true;
    this.light.updateCharacteristic(this.On, true);
  }

  sendColor() {
    this.scenesOff();
    this.markOn();
    return this.send(color(this.state.hue, this.state.sat, this.state.bri));
  }

  // Writes run one at a time so a burst of Home changes can't race the connect.
  send(payload) {
    const run = this.queue.then(async () => {
      const ch = await this.connect();
      this.seq = (this.seq + 1) & 0xff;
      await ch.writeAsync(wrap(payload, this.seq), true);
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.peripheral?.disconnectAsync().catch(() => {}), IDLE_MS);
    });
    this.queue = run.catch(() => {});
    return run.catch((e) => {
      this.log.error(`${this.deviceName}: ${e.message}`);
      throw new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  async connect() {
    if (this.peripheral?.state === 'connected' && this.ch) return this.ch;
    await this.poweredOn();
    try {
      this.peripheral ??= await this.find();
      await Promise.race([this.peripheral.connectAsync(), timeout(15000, 'connect')]);
      const { characteristics } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync([], ['ff01', 'ff02']);
      this.ch = characteristics.find((c) => c.uuid === 'ff01');
      if (!this.ch) throw new Error('write characteristic ff01 not found');
      await characteristics.find((c) => c.uuid === 'ff02')?.subscribeAsync();
      this.log.info(`Connected to ${this.deviceName}`);
      return this.ch;
    } catch (e) {
      this.peripheral?.cancelConnect?.();
      this.peripheral = null; // rescan next time
      throw e;
    }
  }

  poweredOn() {
    if (noble.state === 'poweredOn') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (err) => {
        clearTimeout(timer);
        noble.removeListener('stateChange', onState);
        err ? reject(err) : resolve();
      };
      const onState = (s) => s === 'poweredOn' && done();
      const timer = setTimeout(() => done(new Error(`Bluetooth adapter is ${noble.state}`)), 10000);
      noble.on('stateChange', onState);
    });
  }

  find() {
    return new Promise((resolve, reject) => {
      const done = (err, p) => {
        clearTimeout(timer);
        noble.removeListener('discover', onDiscover);
        noble.stopScanning();
        err ? reject(err) : resolve(p);
      };
      const onDiscover = (p) => p.advertisement.localName === this.deviceName && done(null, p);
      const timer = setTimeout(() => done(new Error('not found nearby (close the Aurelux app if it is connected)')), 20000);
      noble.on('discover', onDiscover);
      noble.startScanning([], true);
    });
  }
}

module.exports = (api) => api.registerAccessory('homebridge-aurelux', 'Aurelux', AureluxLights);
