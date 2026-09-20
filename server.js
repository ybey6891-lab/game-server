const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let peerId = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        if (data.type === 'join') {
            currentRoom = data.room;
            peerId = data.id;
            if (!rooms[currentRoom]) {
                rooms[currentRoom] = {};
            }
            rooms[currentRoom][peerId] = ws;

            for (let id in rooms[currentRoom]) {
                if (id !== peerId) {
                    rooms[currentRoom][id].send(JSON.stringify({ type: 'peer_joined', id: peerId }));
                    ws.send(JSON.stringify({ type: 'peer_joined', id: id }));
                }
            }
        } else if (data.type === 'signal') {
            if (currentRoom && rooms[currentRoom] && rooms[currentRoom][data.to]) {
                rooms[currentRoom][data.to].send(JSON.stringify({
                    type: 'signal',
                    from: peerId,
                    data: data.data
                }));
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            delete rooms[currentRoom][peerId];
            for (let id in rooms[currentRoom]) {
                rooms[currentRoom][id].send(JSON.stringify({ type: 'peer_left', id: peerId }));
            }
            if (Object.keys(rooms[currentRoom]).length === 0) {
                delete rooms[currentRoom];
            }
        }
    });
});

console.log(`Signaling server running on port ${PORT}`);

