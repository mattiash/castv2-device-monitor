import { Client } from 'castv2'
import * as mdns from 'mdns'
import { EventEmitter } from 'events'
import * as dbg from 'debug'

const debug = dbg('cm')

let requestId = 1
export type PowerState = 'on' | 'off'
export type PlayState = 'play' | 'pause'
export type Media = {
    artist: string
    title: string
}

export class ChromecastMonitor extends EventEmitter {
    public powerState: PowerState = 'off'
    public playState: PlayState = 'pause'
    public currentMedia: Media = {
        artist: 'none',
        title: 'none',
    }

    private found = false

    constructor(
        private friendlyName: string,
        private networkInterface?: string,
    ) {
        super()
        let browser = mdns.createBrowser(mdns.tcp('googlecast'))

        // http://bagaar.be/index.php/blog/on-chromecasts-and-slack

        let requestId = 1

        browser.on('serviceUp', service => {
            if (
                this.networkInterface &&
                this.networkInterface !== service.networkInterface
            ) {
                // Ignore wrong interface
            } else {
                if (service.txtRecord.fn === this.friendlyName) {
                    debug('serviceUp', service)
                    if (!this.found) {
                        // If the same device is reachable via several
                        // network interfaces, it will be detected
                        // once per interface.
                        this.found = true
                        this.createClient(service.addresses[0])
                    }
                }
            }
        })

        browser.on('serviceDown', service => {
            if (
                this.networkInterface &&
                this.networkInterface !== service.networkInterface
            ) {
                // Ignore wrong interface
            } else {
                debug('serviceDown', service)
            }
        })
        browser.start()
    }

    createClient(address) {
        debug('createClient', address)
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

            connection.on('message', data => {
                debug('connection message', data)
                if (data.type === 'CLOSE') {
                    // Never seen this happen
                    debug('Connection closed')
                }
            })

            connection.on('close', () => debug('connection closed'))

            setInterval(() => {
                heartbeat.send({ type: 'PING' })
            }, 5000)

            receiver.send({
                type: 'GET_STATUS',
                requestId: requestId++,
            })

            receiver.on('message', data => {
                debug('receiver message', JSON.stringify(data))
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

                mediaConnection.on('message', data => {
                    debug('mediaConnection message', data)
                    if (data.type === 'CLOSE') {
                        // Happens when you press Stop from the cast-dialog in Chrome
                    }
                })

                media.send({
                    type: 'GET_STATUS',
                    requestId: requestId++,
                })
                media.on('message', songInfo => this.parseData(songInfo))
            })
        })
    }

    setPlayState(playerState) {
        let playState: PlayState = 'play'

        if (playerState === 'PAUSED') {
            playState = 'pause'
        }

        if (this.playState !== playState) {
            this.playState = playState
            console.log('playState', playState)
        }
    }

    setMedia(media: Media) {
        if (
            media.artist !== this.currentMedia.artist ||
            media.title !== this.currentMedia.title
        ) {
            this.currentMedia = media
            console.log(this.currentMedia)
        }
    }

    parseData(songInfo) {
        debug('songInfo', songInfo.requestId)
        let status = songInfo.status[0]
        if (status) {
            this.setPlayState(status.playerState)
            if (status.media) {
                this.setMedia({
                    artist: status.media.metadata.artist,
                    title: status.media.metadata.title,
                })
            }
        } else {
            debug('No status')
        }
    }
}

class ClientConnection {
    constructor(address: string) {}
}
let cm = new ChromecastMonitor('Garage', 'en0')
