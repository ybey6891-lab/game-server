const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

// =========================
// HTTP SERVER
// =========================

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("NEX-7 Strike Signaling Server is running!");
});

// =========================
// WEBSOCKET SERVER
// =========================

const wss = new WebSocket.Server({
    server: server
});

// =========================
// ROOMS
// =========================

const rooms = {};

// كم تبقى الغرفة بعد خروج صاحبها
const ROOM_KEEP_TIME = 2 * 60 * 1000; // دقيقتان

function send(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function roomSize(room) {
    return room ? Object.keys(room.peers).length : 0;
}

function createRoom(roomCode) {
    rooms[roomCode] = {
        peers: {},
        hostId: null,
        deleteTimer: null
    };

    return rooms[roomCode];
}

function deleteRoom(roomCode) {
    if (!rooms[roomCode]) {
        return;
    }

    if (rooms[roomCode].deleteTimer) {
        clearTimeout(rooms[roomCode].deleteTimer);
    }

    delete rooms[roomCode];

    console.log("Room deleted:", roomCode);
}

function scheduleRoomDelete(roomCode) {
    const room = rooms[roomCode];

    if (!room) {
        return;
    }

    if (room.deleteTimer) {
        clearTimeout(room.deleteTimer);
    }

    room.deleteTimer = setTimeout(() => {
        const currentRoom = rooms[roomCode];

        if (!currentRoom) {
            return;
        }

        // إذا لم يدخل أحد خلال الوقت المحدد
        if (roomSize(currentRoom) === 0) {
            deleteRoom(roomCode);
        }

    }, ROOM_KEEP_TIME);
}

// =========================
// CONNECTION
// =========================

wss.on("connection", (ws) => {

    let currentRoom = null;
    let peerId = null;

    console.log("Client connected");

    send(ws, {
        type: "connected"
    });

    // =========================
    // MESSAGE
    // =========================

    ws.on("message", (message) => {

        let data;

        try {
            data = JSON.parse(message.toString());
        } catch (e) {
            console.log("Invalid JSON");
            return;
        }

        if (!data || !data.type) {
            return;
        }

        // =====================================================
        // CREATE ROOM
        // =====================================================

        if (data.type === "create") {

            const room = String(data.room || "")
                .trim()
                .toUpperCase();

            const id = String(data.id || "").trim();

            console.log("CREATE:", room, "ID:", id);

            if (room.length !== 5 || id === "") {

                send(ws, {
                    type: "error",
                    message: "Invalid room"
                });

                return;
            }

            // الغرفة موجودة
            if (rooms[room]) {

                send(ws, {
                    type: "error",
                    message: "Room already exists"
                });

                return;
            }

            // إنشاء الغرفة
            const newRoom = createRoom(room);

            currentRoom = room;
            peerId = id;

            newRoom.hostId = id;
            newRoom.peers[id] = ws;

            console.log("Room created:", room);

            send(ws, {
                type: "created",
                code: room
            });

            return;
        }

        // =====================================================
        // JOIN ROOM
        // =====================================================

        if (data.type === "join") {

            const room = String(data.room || "")
                .trim()
                .toUpperCase();

            const id = String(data.id || "").trim();

            console.log("JOIN:", room, "ID:", id);

            if (room.length !== 5 || id === "") {

                send(ws, {
                    type: "error",
                    message: "Invalid room"
                });

                return;
            }

            // الغرفة غير موجودة
            if (!rooms[room]) {

                send(ws, {
                    type: "error",
                    message: "Room not found"
                });

                return;
            }

            const currentRoomData = rooms[room];

            // الغرفة ممتلئة
            if (roomSize(currentRoomData) >= 2) {

                send(ws, {
                    type: "error",
                    message: "Room full"
                });

                return;
            }

            // نفس ID موجود
            if (currentRoomData.peers[id]) {

                send(ws, {
                    type: "error",
                    message: "Peer already exists"
                });

                return;
            }

            // إلغاء مؤقت حذف الغرفة
            if (currentRoomData.deleteTimer) {

                clearTimeout(currentRoomData.deleteTimer);

                currentRoomData.deleteTimer = null;
            }

            currentRoom = room;
            peerId = id;

            currentRoomData.peers[id] = ws;

            console.log(
                "Player joined room:",
                room,
                "ID:",
                id
            );

            // إرسال نجاح للـ JOIN
            send(ws, {
                type: "joined",
                code: room
            });

            // إخبار الطرف الآخر
            for (const existingId in currentRoomData.peers) {

                if (existingId === peerId) {
                    continue;
                }

                const existingWs =
                    currentRoomData.peers[existingId];

                // أخبر الـ Host أن لاعبًا دخل
                send(existingWs, {
                    type: "peer_joined",
                    id: peerId
                });

                // أخبر الـ Joiner بوجود الـ Host
                send(ws, {
                    type: "peer_joined",
                    id: existingId
                });
            }

            return;
        }

        // =====================================================
        // SIGNAL
        // =====================================================

        if (data.type === "signal") {

            if (
                !currentRoom ||
                !rooms[currentRoom] ||
                !peerId
            ) {
                return;
            }

            const targetId = String(data.to || "");

            const target =
                rooms[currentRoom].peers[targetId];

            if (!target) {
                console.log(
                    "Signal target not found:",
                    targetId
                );

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

        console.log(
            "Client disconnected:",
            peerId,
            "Room:",
            currentRoom
        );

        if (
            !currentRoom ||
            !rooms[currentRoom] ||
            !peerId
        ) {
            return;
        }

        const room = rooms[currentRoom];

        delete room.peers[peerId];

        // إذا كان الـ Host خرج
        if (room.hostId === peerId) {

            room.hostId = null;

            // إخبار اللاعبين الباقين
            for (const id in room.peers) {

                send(room.peers[id], {
                    type: "peer_left",
                    id: peerId
                });
            }

            // ننتظر قليلاً قبل حذف الغرفة
            scheduleRoomDelete(currentRoom);

        } else {

            // لاعب عادي خرج
            for (const id in room.peers) {

                send(room.peers[id], {
                    type: "peer_left",
                    id: peerId
                });
            }

            // إذا لم يبق أحد
            if (roomSize(room) === 0) {
                scheduleRoomDelete(currentRoom);
            }
        }

        currentRoom = null;
        peerId = null;
    });

    // =========================
    // ERROR
    // =========================

    ws.on("error", (error) => {

        console.log(
            "WebSocket error:",
            error.message
        );
    });
});

// =========================
// START SERVER
// =========================

server.listen(PORT, () => {

    console.log(
        "NEX-7 Strike server running on port " + PORT
    );

});
