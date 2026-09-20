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

        // 1. عندما يقوم الـ Host بإنشاء الغرفة
        if (data.type === 'create') {
            currentRoom = data.room;
            peerId = data.id;
            rooms[currentRoom] = {};
            rooms[currentRoom][peerId] = ws;
            ws.send(JSON.stringify({ type: 'created', code: currentRoom }));
        } 
        // 2. عندما يحاول الـ Join الانضمام
        else if (data.type === 'join') {
            currentRoom = data.room;
            peerId = data.id;

            // إذا لم تكن الغرفة موجودة أصلاً (لم ينشئها Host)، ارفض الطلب فوراً وأرسل خطأ!
            if (!rooms[currentRoom] || Object.keys(rooms[currentRoom]).length === 0) {
                ws.send(JSON.stringify({ type: 'error', message: 'Room not found or invalid code!' }));
                return;
            }

            rooms[currentRoom][peerId] = ws;

            // ربط اللاعبين ببعضهما
            for (let id in rooms[currentRoom]) {
                if (id !== peerId) {
                    rooms[currentRoom][id].send(JSON.stringify({ type: 'peer_joined', id: peerId }));
                    ws.send(JSON.stringify({ type: 'peer_joined', id: id }));
                }
            }
        } 
        // 3. إشارات الـ WebRTC المتبادلة
        else if (data.type === 'signal') {
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

