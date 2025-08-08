const express = require("express");
const { PeerServer } = require("peer");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const ACTIONS = require("./Actions");
const cors = require("cors");
const axios = require("axios");
const server = http.createServer(app);
require("dotenv").config();

const peerServer = PeerServer({ port: 9000, path: "/myapp" });
peerServer.on("connection", (client) => {
    console.log(`Peer connected: ${client.id}`);
});
peerServer.on("disconnect", (client) => {
    console.log(`Peer disconnected: ${client.id}`);
});

const languageConfig = {
    python3: { versionIndex: "3" },
    java: { versionIndex: "3" },
    cpp: { versionIndex: "4" },
    nodejs: { versionIndex: "3" },
    c: { versionIndex: "4" },
    ruby: { versionIndex: "3" },
    go: { versionIndex: "3" },
    scala: { versionIndex: "3" },
    bash: { versionIndex: "3" },
    sql: { versionIndex: "3" },
    pascal: { versionIndex: "2" },
    csharp: { versionIndex: "3" },
    php: { versionIndex: "3" },
    swift: { versionIndex: "3" },
    rust: { versionIndex: "3" },
    r: { versionIndex: "3" },
};

// Add these lines to serve your static files from the client's build directory
app.use(express.static(path.join(__dirname, 'client/build')));

// And modify the root route to serve the index.html file
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});


const io = new Server(server, {
    cors: {
        origin: "https://code-pod-1.onrender.com",
        methods: ["GET", "POST"],
    },
});

const userSocketMap = {};
const userPeerMap = {};
const roomCodeMap = {}; // To store the latest code for each room

const getAllConnectedClients = (roomId) => {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
                peerId: userPeerMap[socketId]
            };
        }
    );
};

io.on("connection", (socket) => {
    socket.on(ACTIONS.JOIN, ({ roomId, username, peerId }) => {
        userSocketMap[socket.id] = username;
        userPeerMap[socket.id] = peerId;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
        
        // If there's already code for this room, sync it to the new user.
        if (roomCodeMap[roomId]) {
            io.to(socket.id).emit(ACTIONS.SYNC_CODE, { code: roomCodeMap[roomId] });
        }
    });
    
    // Manual sync button functionality
    socket.on(ACTIONS.SYNC_CODE, ({ roomId, code }) => {
      io.to(roomId).emit(ACTIONS.SYNC_CODE, { code });
      roomCodeMap[roomId] = code;
    });

    socket.on('initiate-call', ({ roomId, username }) => {
        socket.to(roomId).emit('call-initiated', { callerUsername: username });
    });

    socket.on('toggle-mute', ({ roomId, isMuted }) => {
        socket.to(roomId).emit('toggle-mute', {
            socketId: socket.id,
            isMuted: isMuted,
        });
    });

    socket.on("chat-message", ({ roomId, username, message }) => {
        io.to(roomId).emit("chat-message", {
            username,
            message,
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
        roomCodeMap[roomId] = code; // Store the latest code for the room
    });
    
    socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });

        delete userSocketMap[socket.id];
        delete userPeerMap[socket.id];
        socket.leave();
    });
});

app.post("/compile", async (req, res) => {
    const { code, language } = req.body;

    try {
        const response = await axios.post("https://api.jdoodle.com/v1/execute", {
            script: code,
            language: language,
            versionIndex: languageConfig[language].versionIndex,
            clientId: process.env.jDoodle_clientId,
            clientSecret: process.env.jDoodle_clientSecret,
        });

        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to compile code" });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));