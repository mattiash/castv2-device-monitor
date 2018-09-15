# castv2-device-monitor

Monitor the state of a castv2 (a.k.a. Chromecast) device.

## Usage

    const DeviceMonitor = require('castv2-device-monitor').DeviceMonitor

    // Monitor the chromecast with the friendly name Livingroom
    let dm = new DeviceMonitor('Livingroom')
    dm.on('powerState', powerState => console.log('powerState', powerState))
    dm.on('playState', playState => console.log('playState', playState))
    dm.on('application', application => console.log('application', application))
    dm.on('media', media => console.log('media', media))

A DeviceMonitor monitors a single Chromecast device and emits events whenever something changes with it.
It can emit the following events:

### event 'powerState'

The powerState event has a single parameter with the possible values 'on' and 'off'.
A DeviceMonitor will always emit a powerState event soon after it is created.

As far as I know, a Chromecast device does not expose any real power indicator.
The powerState is an attempt to emulate a power indicator. powerState will always
be on when the Chromecast is playing something, and it will be set to
off after the Chromecast has been idle for 60 seconds.
To use another idle timeout, supply the timeout in milliseconds
as the third parameter to the DeviceMonitor contructor.

The powerState can be used to control power to
an amplifier or TV that the Chromecast is connected to.

### event 'playState'

The playState event has a single parameter with the possible values 'play' and 'pause'.

### event 'application'

The application event has a single parameter that is the friendly name of
the application that is currently controlling the Chromecast.

### event 'media'

The media event has a single parameter that contains an object with properties
'artist' and 'title'. These describe the currently playing song on the Chromecast.

### event 'volume'
The volume event has a single parameter that contains the current volume as
a number between 0-1, where 0 is muted and 1 is the maximum volume.

# Controlling device

The DeviceMonitor also offers a limited ability to control playback on the device:

    dm.pauseDevice()
    dm.playDevice()
    dm.volumeUp()
    dm.volumeDown()

Additionally, dm.stopDevice() can be used to stop the session
from the application to the device.
It usually means that you have to
select the cast-device again from the application.

# Debugging

This module includes a binary castv2-device-monitor for testing purposes.

Usage:

    ./node_modules/.bin/castv2-device-monitor Livingroom

    DEBUG=* ./node_modules/.bin/castv2-device-monitor Livingroom eth0 5000
