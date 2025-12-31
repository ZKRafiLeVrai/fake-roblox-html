const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURATION ---
const PORT = 3000;
const dbURI = "mongodb+srv://RafiLeVrai:Portugal.83@cluster0.wzhesfi.mongodb.net/webblox?retryWrites=true&w=majority";

// Connexion MongoDB Atlas
mongoose.connect(dbURI)
    .then(() => console.log("✅ Atlas Connecté"))
    .catch(err => console.log("❌ Erreur Atlas:", err));

const Block = mongoose.model('Block', { gameId: String, pos: Object, color: Number });

// Servir les fichiers du dossier actuel
app.use(express.static(__dirname));

let players = {};

io.on('connection', (socket) => {
    socket.on('joinGame', async (data) => {
        socket.join(data.gameId);
        players[socket.id] = { 
            id: socket.id, 
            name: data.name, 
            pos: {x:0, y:2, z:0}, 
            gameId: data.gameId,
            color: Math.random() * 0xffffff 
        };
        
        const blocks = await Block.find({ gameId: data.gameId });
        socket.emit('loadInitialBlocks', blocks);
        io.to(data.gameId).emit('updatePlayers', getPlayersInRoom(data.gameId));
    });

    socket.on('move', (pos) => {
        if (players[socket.id]) {
            players[socket.id].pos = pos;
            socket.to(players[socket.id].gameId).emit('updatePlayers', getPlayersInRoom(players[socket.id].gameId));
        }
    });

    socket.on('placeBlock', async (blockData) => {
        if(players[socket.id]) {
            const b = new Block({ ...blockData, gameId: players[socket.id].gameId });
            await b.save();
            io.to(players[socket.id].gameId).emit('blockPlaced', blockData);
        }
    });

    socket.on('chatMessage', (msg) => {
        if(players[socket.id]) {
            io.to(players[socket.id].gameId).emit('chatUpdate', { user: players[socket.id].name, text: msg });
        }
    });

    socket.on('disconnect', () => {
        const roomId = players[socket.id]?.gameId;
        delete players[socket.id];
        if(roomId) io.to(roomId).emit('updatePlayers', getPlayersInRoom(roomId));
    });
});

function getPlayersInRoom(roomId) {
    const roomPlayers = {};
    for (let id in players) {
        if (players[id].gameId === roomId) roomPlayers[id] = players[id];
    }
    return roomPlayers;
}

server.listen(PORT, () => console.log(`🚀 Serveur : http://localhost:${PORT}`));