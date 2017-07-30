#!/usr/bin/env node

import { DeviceMonitor } from './index'

let [, , deviceName, timeout] = process.argv

let cm = new DeviceMonitor(deviceName, parseInt(timeout) || undefined)

cm.on('powerState', powerState => console.log('powerState', powerState))
cm.on('playState', playState => console.log('playState', playState))
cm.on('application', application => console.log('application', application))
cm.on('media', media => console.log('media', media))
