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

        if (!data.type) {
            return;
        }

        if (data.type === "create") {

            const room = String(data.room || "").trim().toUpperCase();
            const id = String(data.id || "");

            if (room === "" || id === "") {
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

            rooms[room] = {
                [peerId]: ws
            };

            send(ws, {
                type: "created",
                code: room
            });

            return;
        }

        if (data.type === "join") {

            const room = String(data.room || "").trim().toUpperCase();
            const id = String(data.id || "");

            if (room === "" || id === "") {
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

            const playerCount = Object.keys(rooms[room]).length;

            if (playerCount >= 2) {
                send(ws, {
                    type: "error",
                    message: "Room full"
                });
                return;
            }

            currentRoom = room;
            peerId = id;

            rooms[room][peerId] = ws;

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

        if (data.type === "signal") {

            if (!currentRoom) {
                return;
            }

            if (!rooms[currentRoom]) {
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

    ws.on("close", () => {

        if (!currentRoom || !rooms[currentRoom]) {
            return;
        }

        delete rooms[currentRoom][peerId];

        for (const id in rooms[currentRoom]) {

            send(rooms[currentRoom][id], {
                type: "peer_left",
                id: peerId
            });
        }

        if (Object.keys(rooms[currentRoom]).length === 0) {
            delete rooms[currentRoom];
        }

        currentRoom = null;
        peerId = null;
    });
});

console.log("Signaling server running on port " + PORT);
