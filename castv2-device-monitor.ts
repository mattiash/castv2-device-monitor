#!/usr/bin/env node

import { DeviceMonitor } from './'

let [, , deviceName, interfaceName, timeout] = process.argv

let cm = new DeviceMonitor(
    deviceName,
    interfaceName,
    parseInt(timeout) || undefined,
)

cm.on('powerState', powerState => console.log('powerState', powerState))
cm.on('playState', playState => console.log('playState', playState))
cm.on('application', application => console.log('application', application))
cm.on('media', media => console.log('media', media))
