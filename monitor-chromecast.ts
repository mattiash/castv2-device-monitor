import { Client, DefaultMediaReceiver } from 'castv2'
import * as mdns from 'mdns'

let browser = mdns.createBrowser(mdns.tcp('googlecast'))

// http://bagaar.be/index.php/blog/on-chromecasts-and-slack

let requestId = 1

browser.on('serviceUp', service => {
    if (service.txtRecord.fn === 'Garage') {
        browser.stop()
        let client = new Client()
        client.connect(service.addresses[0], () => {
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
            receiver.send({ type: 'GET_STATUS', requestId: requestId++ })
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
                media.send({ type: 'GET_STATUS', requestId: requestId++ })
                media.on('message', songInfo => parseData(songInfo))
            })
        })
    }
})

function parseData(songInfo) {
    console.log('songInfo', JSON.stringify(songInfo))
}

browser.start()

function ondeviceup(host) {
    let client = new Client()

    client.connect(host, function() {
        // create various namespace handlers
        let connection = client.createChannel(
            'sender-0',
            'receiver-0',
            'urn:x-cast:com.google.cast.tp.connection',
            'JSON',
        )
        let heartbeat = client.createChannel(
            'sender-0',
            'receiver-0',
            'urn:x-cast:com.google.cast.tp.heartbeat',
            'JSON',
        )
        let receiver = client.createChannel(
            'sender-0',
            'receiver-0',
            'urn:x-cast:com.google.cast.receiver',
            'JSON',
        )
        let media = client.createChannel(
            'sender-0',
            'receiver-0',
            'urn:x-cast:com.google.cast.media',
            'JSON',
        )

        // establish virtual connection to the receiver
        connection.send({ type: 'CONNECT' })

        // start heartbeating
        setInterval(function() {
            heartbeat.send({ type: 'PING' })
        }, 5000)

        receiver.send({ type: 'GET_STATUS', requestId: 1 })
        media.send({ type: 'GET_STATUS', requestId: 2 })

        // display receiver status updates
        receiver.on('message', function(data, broadcast) {
            console.log(JSON.stringify(data))
        })

        media.on('message', function(data, broadcast) {
            console.log(JSON.stringify(data))
        })
    })
}
