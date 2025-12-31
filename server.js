const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

// 1. DÉCLARATION DU PORT (UNE SEULE FOIS)
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 2. CONFIGURATION MONGODB ATLAS
const dbURI = "mongodb+srv://RafiLeVrai:Portugal.83@cluster0.wzhesfi.mongodb.net/webblox?retryWrites=true&w=majority";

mongoose.connect(dbURI)
    .then(() => console.log("✅ Connecté à MongoDB Atlas"))
    .catch(err => console.error("❌ Erreur de connexion Atlas :", err));

// Modèle de données pour les blocs
const Block = mongoose.model('Block', { 
    gameId: String, 
    pos: { x: Number, y: Number, z: Number }, 
    color: Number 
});

// 3. MIDDLEWARES ET FICHIERS STATIQUES
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 4. GESTION DES JOUEURS ET DU MULTIJOUEUR
let players = {};

io.on('connection', (socket) => {
    console.log('Nouveau joueur :', socket.id);

    // Rejoindre un salon (Room)
    socket.on('joinGame', async (data) => {
        socket.join(data.gameId);
        
        // Création du profil joueur
        players[socket.id] = {
            id: socket.id,
            name: data.name || "Joueur",
            pos: { x: 0, y: 2, z: 0 },
            gameId: data.gameId,
            color: Math.random() * 0xffffff
        };

        // Envoyer les blocs existants de ce salon au nouveau joueur
        try {
            const blocks = await Block.find({ gameId: data.gameId });
            socket.emit('loadInitialBlocks', blocks);
        } catch (err) {
            console.error("Erreur chargement blocs:", err);
        }

        // Informer les autres joueurs du salon
        io.to(data.gameId).emit('updatePlayers', getPlayersInRoom(data.gameId));
    });

    // Mouvement du joueur
    socket.on('move', (pos) => {
        if (players[socket.id]) {
            players[socket.id].pos = pos;
            // On diffuse aux autres joueurs du même salon
            socket.to(players[socket.id].gameId).emit('updatePlayers', getPlayersInRoom(players[socket.id].gameId));
        }
    });

    // Poser un bloc
    socket.on('placeBlock', async (blockData) => {
        if (players[socket.id]) {
            try {
                const newBlock = new Block({ 
                    ...blockData, 
                    gameId: players[socket.id].gameId 
                });
                await newBlock.save();
                io.to(players[socket.id].gameId).emit('blockPlaced', blockData);
            } catch (err) {
                console.error("Erreur sauvegarde bloc:", err);
            }
        }
    });

    // Chat
    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.to(players[socket.id].gameId).emit('chatUpdate', { 
                user: players[socket.id].name, 
                text: msg 
            });
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        const roomId = players[socket.id]?.gameId;
        delete players[socket.id];
        if (roomId) {
            io.to(roomId).emit('updatePlayers', getPlayersInRoom(roomId));
        }
        console.log('Joueur déconnecté :', socket.id);
    });
});

// Fonction utilitaire pour filtrer les joueurs par salon
function getPlayersInRoom(roomId) {
    const roomPlayers = {};
    for (let id in players) {
        if (players[id].gameId === roomId) {
            roomPlayers[id] = players[id];
        }
    }
    return roomPlayers;
}

// 5. LANCEMENT DU SERVEUR
server.listen(PORT, () => {
    console.log(`🚀 Serveur Web-Blox opérationnel sur le port ${PORT}`);
});
