const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on("connection", (ws) => {
    let currentRoom = null;
    let peerId = null;

    ws.on("message", (message) => {
        let data;

        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            return;
        }

        // CREATE ROOM
        if (data.type === "create") {
            currentRoom = String(data.room).toUpperCase();
            peerId = String(data.id);

            if (!rooms[currentRoom]) {
                rooms[currentRoom] = {};
            }

            rooms[currentRoom][peerId] = ws;

            ws.send(JSON.stringify({
                type: "created",
                code: currentRoom
            }));

            console.log("ROOM CREATED:", currentRoom);
        }

        // JOIN ROOM
        else if (data.type === "join") {
            currentRoom = String(data.room).toUpperCase();
            peerId = String(data.id);

            if (!rooms[currentRoom]) {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "ROOM_NOT_FOUND"
                }));
                return;
            }

            rooms[currentRoom][peerId] = ws;

            console.log("PLAYER JOINED:", peerId, "ROOM:", currentRoom);

            for (const id in rooms[currentRoom]) {
                if (id !== peerId) {

                    // Tell old player
                    rooms[currentRoom][id].send(JSON.stringify({
                        type: "peer_joined",
                        id: Number(peerId)
                    }));

                    // Tell new player
                    ws.send(JSON.stringify({
                        type: "peer_joined",
                        id: Number(id)
                    }));
                }
            }
        }

        // WEBRTC SIGNAL
        else if (data.type === "signal") {
            if (
                currentRoom &&
                rooms[currentRoom] &&
                rooms[currentRoom][String(data.to)]
            ) {
                rooms[currentRoom][String(data.to)].send(
                    JSON.stringify({
                        type: "signal",
                        from: Number(peerId),
                        data: data.data
                    })
                );
            }
        }
    });

    ws.on("close", () => {
        if (!currentRoom || !rooms[currentRoom]) {
            return;
        }

        delete rooms[currentRoom][peerId];

        for (const id in rooms[currentRoom]) {
            rooms[currentRoom][id].send(
                JSON.stringify({
                    type: "peer_left",
                    id: Number(peerId)
                })
            );
        }

        if (Object.keys(rooms[currentRoom]).length === 0) {
            delete rooms[currentRoom];
        }
    });
});

console.log(`Signaling server running on port ${PORT}`);
