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
    public app: string | undefined = undefined

    public currentMedia: Media = {
        artist: 'none',
        title: 'none',
    }

    private found = false

    private serviceName: string
    private clientConnection: ClientConnection

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
                    if (this.clientConnection) {
                        debug('Destroying clientConnection to replace with new')
                        this.clientConnection.close()
                    }
                    this.clientConnection = new ClientConnection(
                        service.addresses[0],
                        this,
                    )
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
                if (service.name === this.serviceName) {
                    if (this.clientConnection) {
                        debug('No clientConnection to destroy')
                    } else {
                        this.clientConnection.close()
                    }
                }
            }
        })
        browser.start()
    }

    setPlayState(playerState) {
        let playState: PlayState = 'play'

        if (
            playerState === 'PAUSED' ||
            playerState === 'IDLE' ||
            playerState === 'BUFFERING'
        ) {
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

    setApplication(application: string) {
        if (application !== this.app) {
            this.app = application
            console.log('application', this.app)
        }
    }
}

class ClientConnection {
    private client: Client
    private interval: NodeJS.Timer
    private active = false

    constructor(address: string, private monitor: ChromecastMonitor) {
        this.client = new Client()

        this.client.on('error', error => {
            console.log('error event', error)
            this.close()
        })

        this.client.connect(address, () => {
            this.active = true
            const connection = this.client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.tp.connection',
                'JSON',
            )
            const receiver = this.client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.receiver',
                'JSON',
            )
            const heartbeat = this.client.createChannel(
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
            connection.on('disconnect', () => debug('connection disconnect'))

            this.interval = setInterval(() => {
                heartbeat.send({ type: 'PING' })
            }, 5000)

            receiver.send({
                type: 'GET_STATUS',
                requestId: requestId++,
            })

            receiver.on('message', data => {
                debug('receiver message', JSON.stringify(data))
                if (!data.status.applications) return
                this.monitor.setApplication(
                    data.status.applications[0].displayName,
                )
                let appID = data.status.applications[0].transportId
                new MediaConnection(this.client, appID, this.monitor)
            })
        })
    }

    close() {
        if (this.active) {
            this.active = false
            clearInterval(this.interval)
            this.client.close()
        }
    }
}

class MediaConnection {
    constructor(
        client: any,
        appId: string,
        private monitor: ChromecastMonitor,
    ) {
        let mediaConnection = client.createChannel(
            'client-17558',
            appId,
            'urn:x-cast:com.google.cast.tp.connection',
            'JSON',
        )

        let media = client.createChannel(
            'client-17558',
            appId,
            'urn:x-cast:com.google.cast.media',
            'JSON',
        )

        mediaConnection.send({ type: 'CONNECT' })

        mediaConnection.on('message', data => {
            debug('mediaConnection message', data)
            if (data.type === 'CLOSE') {
                // Happens when you press Stop from the cast-dialog in Chrome
                debug('Closing MediaConnection')
                mediaConnection.close()
                media.close()
            }
        })

        media.send({
            type: 'GET_STATUS',
            requestId: requestId++,
        })
        media.on('message', songInfo => this.parseData(songInfo))
    }

    parseData(songInfo) {
        debug('songInfo', songInfo.requestId)
        let status = songInfo.status[0]
        if (status) {
            this.monitor.setPlayState(status.playerState)
            if (status.media) {
                this.monitor.setMedia({
                    artist: status.media.metadata.artist,
                    title: status.media.metadata.title,
                })
            }
        } else {
            debug('No status')
        }
    }
}

let cm = new ChromecastMonitor('Garage', 'en0')
