const Client = require('castv2').Client
const mdns = require('mdns-js')

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

export class DeviceMonitor extends EventEmitter {
    public powerState: PowerState | undefined = undefined
    public playState: PlayState = 'pause'
    public application: string | undefined = undefined

    public currentMedia: Media = {
        artist: 'none',
        title: 'none',
    }

    private clientConnection: ClientConnection | undefined
    private idleTimer: NodeJS.Timer | undefined = undefined
    private clientIp: string

    constructor(
        private friendlyName: string,
        private idleTimeout: number = 60000,
    ) {
        super()

        setTimeout(() => {
            if (!this.powerState) {
                this.setPowerState('off')
            }
        }, 2000)

        let browser = mdns.createBrowser(mdns.tcp('googlecast'))
        browser.on('ready', function() {
            browser.discover()
        })

        // http://bagaar.be/index.php/blog/on-chromecasts-and-slack

        browser.on('update', (service: any) => {
            if (
                service.type[0].name === 'googlecast' &&
                service.txt &&
                service.txt.includes('fn=' + this.friendlyName)
            ) {
                let clientIp = service.addresses[0]
                if (clientIp !== this.clientIp) {
                    this.clientIp = clientIp
                    if (this.clientConnection) {
                        debug('Destroying clientConnection to replace with new')
                        this.clientConnection.close()
                    }
                    this.clientConnection = new ClientConnection(
                        this.clientIp,
                        this,
                    )
                }
                debug(service)
                debug('serviceUp')
            }
        })
    }

    setPowerState(powerState: PowerState) {
        if (powerState !== this.powerState) {
            this.powerState = powerState

            if (this.powerState === 'on') {
                this.clearIdleTimer()
            }

            this.emit('powerState', this.powerState)
        }
    }

    setPlayState(playerState: string) {
        let playState: PlayState = 'play'

        if (
            playerState === 'PAUSED' ||
            playerState === 'IDLE' ||
            playerState === 'BUFFERING'
        ) {
            playState = 'pause'
        }

        if (this.playState !== playState) {
            if (playState === 'play') {
                this.setPowerState('on')
                this.clearIdleTimer()
            } else {
                this.setIdleTimer()
            }
            this.playState = playState
            this.emit('playState', this.playState)
        }
    }

    setMedia(media: Media) {
        if (
            media.artist !== this.currentMedia.artist ||
            media.title !== this.currentMedia.title
        ) {
            this.currentMedia = media
            this.emit('media', this.currentMedia)
        }
    }

    setApplication(application: string) {
        if (application === 'Backdrop') {
            this.setPowerState('off')
            this.application = application
        } else {
            this.setPowerState('on')
            if (this.playState === 'pause') {
                this.setIdleTimer()
            }
            if (application !== this.application) {
                this.application = application
                this.emit('application', this.application)
            }
        }
    }

    setIdleTimer() {
        debug('setIdleTimer')
        this.clearIdleTimer()
        this.idleTimer = setTimeout(() => {
            debug('idleTimeout')
            this.setPowerState('off')
        }, this.idleTimeout)
    }

    clearIdleTimer() {
        debug('clearIdleTimer')
        if (this.idleTimer !== undefined) {
            debug('idleTimer cleared')
            clearTimeout(this.idleTimer)
            this.idleTimer = undefined
        }
    }

    stopDevice() {
        if (this.clientConnection) {
            this.clientConnection.stopDevice()
        }
    }

    pauseDevice() {
        if (this.clientConnection && this.playState === 'play') {
            this.clientConnection.pauseDevice()
        }
    }

    playDevice() {
        if (this.clientConnection && this.playState === 'pause') {
            this.clientConnection.playDevice()
        }
    }

    volumeUp() {
        if (this.clientConnection) {
            this.clientConnection.volumeUp()
        }
    }

    volumeDown() {
        if (this.clientConnection) {
            this.clientConnection.volumeDown()
        }
    }

    setVolume(level: number) {
        if (this.clientConnection) {
            this.clientConnection.setVolume(level)
        }
    }
}

class ClientConnection {
    private client: any
    private interval: NodeJS.Timer
    private active = false
    private reconnectTimer: NodeJS.Timer
    private receiver: any
    private transportId: string
    private sessionId: string
    private mediaConnection: MediaConnection
    private volume: number

    constructor(private address: string, private monitor: DeviceMonitor) {
        this.connect()
    }

    connect() {
        this.active = true
        this.client = new Client()

        this.client.on('error', (error: any) => {
            debug('error event', error)
            this.close()
            this.reconnectTimer = setTimeout(() => this.connect(), 5000)
        })

        this.client.connect(this.address, () => {
            debug('Connected')

            const connection = this.client.createChannel(
                'sender-0',
                'receiver-0',
                'urn:x-cast:com.google.cast.tp.connection',
                'JSON',
            )
            this.receiver = this.client.createChannel(
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

            connection.on('message', (data: any) => {
                debug('connection message', data)
                if (data.type === 'CLOSE') {
                    // Never seen this happen
                    debug('Connection closed')
                    this.close()
                }
            })

            connection.on('close', () => debug('connection closed'))
            connection.on('disconnect', () => debug('connection disconnect'))

            this.interval = setInterval(() => {
                heartbeat.send({ type: 'PING' })
            }, 5000)

            this.receiver.send({
                type: 'GET_STATUS',
                requestId: requestId++,
            })

            this.receiver.on('message', (data: any) => {
                if (!data.status.applications) return
                this.monitor.setApplication(
                    data.status.applications[0].displayName,
                )

                let transportId = data.status.applications[0].transportId
                this.volume = data.status.volume.level
                debug('volume', this.volume)
                if (this.transportId !== transportId) {
                    this.transportId = transportId
                    this.mediaConnection = new MediaConnection(
                        this.client,
                        this.transportId,
                        this.monitor,
                    )
                }
                this.sessionId = data.status.applications[0].sessionId
            })
        })
    }

    close() {
        if (this.active) {
            this.active = false
            clearInterval(this.interval)
            this.client.close()
            this.receiver = undefined
        } else {
            clearTimeout(this.reconnectTimer)
        }
    }

    stopDevice() {
        if (this.receiver) {
            this.receiver.send({
                type: 'STOP',
                requestId: requestId++,
                sessionId: this.sessionId,
            })
        }
    }

    pauseDevice() {
        if (this.mediaConnection) {
            this.mediaConnection.pause()
        }
    }

    playDevice() {
        if (this.mediaConnection) {
            this.mediaConnection.play()
        }
    }

    volumeUp() {
        this.receiver.send({
            type: 'SET_VOLUME',
            volume: { level: this.volume + 0.05 },
            requestId: requestId++,
        })
    }

    volumeDown() {
        this.receiver.send({
            type: 'SET_VOLUME',
            volume: { level: this.volume - 0.05 },
            requestId: requestId++,
        })
    }

    setVolume(level: number) {
        this.receiver.send({
            type: 'SET_VOLUME',
            volume: { level: level },
            requestId: requestId++,
        })
    }
}

class MediaConnection {
    private mediaSessionId: string
    private media: any

    constructor(
        client: any,
        transportId: string,
        private monitor: DeviceMonitor,
    ) {
        debug('new MediaConnection', transportId)
        let mediaConnection = client.createChannel(
            'client-17558',
            transportId,
            'urn:x-cast:com.google.cast.tp.connection',
            'JSON',
        )

        this.media = client.createChannel(
            'client-17558',
            transportId,
            'urn:x-cast:com.google.cast.media',
            'JSON',
        )

        mediaConnection.send({ type: 'CONNECT' })

        mediaConnection.on('message', (data: any) => {
            debug('mediaConnection message', data)
            if (data.type === 'CLOSE') {
                // Happens when you press Stop from the cast-dialog in Chrome
                debug('Closing MediaConnection')
                mediaConnection.close()
                this.media.close()
            }
        })

        this.media.send({
            type: 'GET_STATUS',
            requestId: requestId++,
        })

        this.media.on('message', (message: any) => this.parseMessage(message))
    }

    pause() {
        this.media.send({
            type: 'PAUSE',
            mediaSessionId: this.mediaSessionId,
            requestId: requestId++,
        })
    }

    play() {
        this.media.send({
            type: 'PLAY',
            mediaSessionId: this.mediaSessionId,
            requestId: requestId++,
        })
    }

    parseMessage(message: any) {
        debug('media message', message.requestId)
        if (message.type === 'MEDIA_STATUS') {
            let status = message.status[0]
            if (status) {
                this.mediaSessionId = status.mediaSessionId
                this.monitor.setPlayState(status.playerState)
                if (status.media && status.media.metadata) {
                    this.monitor.setMedia({
                        artist: status.media.metadata.artist,
                        title: status.media.metadata.title,
                    })
                }
            }
        }
    }
}
