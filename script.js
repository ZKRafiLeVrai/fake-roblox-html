import * as THREE from 'three';
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

let scene, camera, renderer, socket;
let move = { f: 0, b: 0, l: 0, r: 0 };
let otherPlayers = {};

window.launch = () => {
    const user = document.getElementById('username').value || "Joueur";
    const room = document.getElementById('gameSelect').value;
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('gui').style.display = 'block';
    document.getElementById('chat').style.display = 'flex';
    init(user, room);
};

function init(username, roomId) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // FIX Caméra : On empêche Three.js d'utiliser les quaternions de manière imprévisible
    camera.rotation.order = 'YXZ'; 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshPhongMaterial({color: 0x27ae60}));
    floor.rotation.x = -Math.PI/2;
    scene.add(floor);

    socket = io();
    socket.emit('joinGame', { name: username, gameId: roomId });

    socket.on('loadInitialBlocks', (blocks) => {
        blocks.forEach(b => addBlockLocal(b.pos, b.color));
    });

    socket.on('updatePlayers', (players) => {
        document.getElementById('pCount').innerText = Object.keys(players).length;
        for (let id in players) {
            if (id === socket.id) continue;
            if (!otherPlayers[id]) {
                const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 4), new THREE.MeshPhongMaterial({color: players[id].color}));
                scene.add(mesh);
                otherPlayers[id] = mesh;
            }
            otherPlayers[id].position.lerp(players[id].pos, 0.1);
        }
    });

    socket.on('chatUpdate', (data) => {
        const c = document.getElementById('chat');
        c.innerHTML += `<div class="chat-msg"><b>${data.user}:</b> ${data.text}</div>`;
        c.scrollTop = c.scrollHeight;
    });

    socket.on('blockPlaced', (data) => addBlockLocal(data.pos, data.color));

    // --- INPUTS ---
    window.addEventListener('keydown', (e) => {
        if(e.code === 'KeyW') move.f = 1; if(e.code === 'KeyS') move.b = 1;
        if(e.code === 'KeyA') move.l = 1; if(e.code === 'KeyD') move.r = 1;
        if(e.key.toLowerCase() === 't') { // Touche T pour parler
            const m = prompt("Message:");
            if(m) socket.emit('chatMessage', m);
        }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code === 'KeyW') move.f = 0; if(e.code === 'KeyS') move.b = 0;
        if(e.code === 'KeyA') move.l = 0; if(e.code === 'KeyD') move.r = 0;
    });

    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) {
            camera.rotation.y -= e.movementX * 0.002;
            let targetX = camera.rotation.x - e.movementY * 0.002;
            camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetX));
            camera.rotation.z = 0; // FORCE L'HORIZON DROIT
        }
    });

    document.body.onclick = () => {
        if(document.pointerLockElement !== document.body) document.body.requestPointerLock();
        else placeBlock();
    };

    animate();
}

function addBlockLocal(pos, color) {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshPhongMaterial({color}));
    cube.position.copy(pos);
    scene.add(cube);
}

function placeBlock() {
    const col = parseInt(document.getElementById('blockColor').value.replace('#', '0x'));
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const pos = camera.position.clone().add(dir.multiplyScalar(6));
    pos.set(Math.round(pos.x/2)*2, Math.round(pos.y/2)*2, Math.round(pos.z/2)*2);
    addBlockLocal(pos, col);
    socket.emit('placeBlock', { pos, color: col });
}

function animate() {
    requestAnimationFrame(animate);
    if(document.pointerLockElement === document.body) {
        camera.translateX((move.r - move.l) * 0.15);
        camera.translateZ((move.b - move.f) * 0.15);
        camera.position.y = 2;
        socket.emit('move', camera.position);
    }
    renderer.render(scene, camera);
}