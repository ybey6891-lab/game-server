const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const wss = new WebSocket.Server({
    port: PORT
});

const rooms = {};

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function roomSize(room) {
    return room ? Object.keys(room).length : 0;
}

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

        if (!data || !data.type) {
            return;
        }

        // =========================
        // CREATE ROOM
        // =========================

        if (data.type === "create") {
            const room = String(data.room || "").trim().toUpperCase();
            const id = String(data.id || "").trim();

            if (room.length !== 5 || id === "") {
                send(ws, {
                    type: "error",
                    message: "Invalid room"
                });
                return;
            }

            if (rooms[room]) {
                send(ws, {
                    type: "error",
                    message: "Room already exists"
                });
                return;
            }

            currentRoom = room;
            peerId = id;

            rooms[room] = {};
            rooms[room][peerId] = ws;

            send(ws, {
                type: "created",
                code: room
            });

            return;
        }

        // =========================
        // JOIN ROOM
        // =========================

        if (data.type === "join") {
            const room = String(data.room || "").trim().toUpperCase();
            const id = String(data.id || "").trim();

            if (room.length !== 5 || id === "") {
                send(ws, {
                    type: "error",
                    message: "Invalid room"
                });
                return;
            }

            if (!rooms[room]) {
                send(ws, {
                    type: "error",
                    message: "Room not found"
                });
                return;
            }

            if (roomSize(rooms[room]) >= 2) {
                send(ws, {
                    type: "error",
                    message: "Room full"
                });
                return;
            }

            currentRoom = room;
            peerId = id;

            rooms[room][peerId] = ws;

            // Tell JOINER that the room actually exists.
            send(ws, {
                type: "joined",
                code: room
            });

            // Tell both sides about the new peer.
            for (const existingId in rooms[room]) {
                if (existingId === peerId) {
                    continue;
                }

                const existingWs = rooms[room][existingId];

                send(existingWs, {
                    type: "peer_joined",
                    id: peerId
                });

                send(ws, {
                    type: "peer_joined",
                    id: existingId
                });
            }

            return;
        }

        // =========================
        // SIGNAL
        // =========================

        if (data.type === "signal") {
            if (!currentRoom || !rooms[currentRoom] || !peerId) {
                return;
            }

            const targetId = String(data.to || "");
            const target = rooms[currentRoom][targetId];

            if (!target) {
                return;
            }

            send(target, {
                type: "signal",
                from: peerId,
                data: data.data
            });

            return;
        }
    });

    // =========================
    // DISCONNECT
    // =========================

    ws.on("close", () => {
        if (!currentRoom || !rooms[currentRoom] || !peerId) {
            return;
        }

        delete rooms[currentRoom][peerId];

        for (const id in rooms[currentRoom]) {
            send(rooms[currentRoom][id], {
                type: "peer_left",
                id: peerId
            });
        }

        if (roomSize(rooms[currentRoom]) === 0) {
            delete rooms[currentRoom];
        }

        currentRoom = null;
        peerId = null;
    });
});

console.log("Signaling server running on port " + PORT);
