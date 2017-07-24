import { Client, DefaultMediaReceiver } from 'castv2'
import * as mdns from 'mdns'
import { EventEmitter } from 'events'

let requestId = 1

export class ChromecastMonitor extends EventEmitter {
    constructor(private friendlyName: string) {
        super()
        let browser = mdns.createBrowser(mdns.tcp('googlecast'))

        // http://bagaar.be/index.php/blog/on-chromecasts-and-slack

        let requestId = 1

        browser.on('serviceUp', service => {
            if (service.txtRecord.fn === this.friendlyName) {
                this.createClient(service.addresses[0])
                browser.stop()
            }
        })
        browser.start()
    }

    createClient(address) {
        let client = new Client()
        client.connect(address, () => {
            const connection = client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.tp.connection',
                'JSON',
            )
            const receiver = client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.receiver',
                'JSON',
            )
            const heartbeat = client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.heartbeat',
                'JSON',
            )
            connection.send({ type: 'CONNECT' })
            setInterval(() => {
                heartbeat.send({ type: 'PING' })
            }, 5000)
            receiver.send({
                type: 'GET_STATUS',
                requestId: requestId++,
            })
            receiver.on('message', data => {
                if (!data.status.applications) return
                let appID = data.status.applications[0].transportId
                let mediaConnection = client.createChannel(
                    'client-17558',
                    appID,
                    'urn:x-cast:com.google.cast.tp.connection',
                    'JSON',
                )
                let media = client.createChannel(
                    'client-17558',
                    appID,
                    'urn:x-cast:com.google.cast.media',
                    'JSON',
                )
                mediaConnection.send({ type: 'CONNECT' })
                media.send({
                    type: 'GET_STATUS',
                    requestId: requestId++,
                })
                media.on('message', songInfo => parseData(songInfo))
            })
        })
    }
}

function parseData(songInfo) {
    console.log('songInfo', JSON.stringify(songInfo))
}

let cm = new ChromecastMonitor('Garage')
