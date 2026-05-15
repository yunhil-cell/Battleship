import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, get } 
    from "https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAzDc8nErqYcYYy-itp2Tk9WZExy3PBlIU",
    authDomain: "battleship-f08f8.firebaseapp.com",
    projectId: "battleship-f08f8",
    storageBucket: "battleship-f08f8.firebasestorage.app",
    messagingSenderId: "1146329001",
    appId: "1:1146329001:web:f2d698e5661582ee1f96b8",
    databaseURL: "https://battleship-f08f8-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let myUid, myNickname, currentRoom;
let selectedShipSize = null;
let isHorizontal = true;
let myShips = []; 
let deployedCells = new Set();
let gameState = 'setup'; 

const myBoardEl = document.getElementById('my-board');
const enemyBoardEl = document.getElementById('enemy-board');

function createBoards() {
    myBoardEl.innerHTML = '';
    enemyBoardEl.innerHTML = '';
    for (let i = 0; i < 64; i++) {
        const myCell = document.createElement('div');
        myCell.className = 'cell';
        myCell.dataset.id = i;
        myCell.onclick = () => placeShip(i);
        myBoardEl.appendChild(myCell);

        const enemyCell = document.createElement('div');
        enemyCell.className = 'cell';
        enemyCell.dataset.id = i;
        enemyCell.onclick = () => attack(i);
        enemyBoardEl.appendChild(enemyCell);
    }
}

document.querySelectorAll('.ship-btn').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.ship-btn').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedShipSize = parseInt(e.target.dataset.size);
        selectedShipBtn = e.target;
    };
});

let selectedShipBtn = null;
document.getElementById('rotate-btn').onclick = (e) => {
    isHorizontal = !isHorizontal;
    e.target.innerText = isHorizontal ? "방향: 가로" : "방향: 세로";
};

function placeShip(startId) {
    if (!selectedShipSize || !selectedShipBtn || gameState !== 'setup') return;
    const cells = [];
    for (let i = 0; i < selectedShipSize; i++) {
        let curr = isHorizontal ? startId + i : startId + (i * 8);
        if (isHorizontal && Math.floor(startId / 8) !== Math.floor(curr / 8)) return;
        if (curr >= 64 || deployedCells.has(curr)) return;
        cells.push(curr);
    }
    cells.forEach(id => {
        deployedCells.add(id);
        myBoardEl.children[id].classList.add('ship');
    });
    myShips.push(cells);
    selectedShipBtn.disabled = true;
    selectedShipBtn.classList.remove('selected');
    selectedShipSize = null;
}

document.getElementById('login-btn').onclick = async () => {
    myNickname = document.getElementById('nickname').value;
    currentRoom = document.getElementById('room-select').value;
    if (!myNickname) return alert("팀명을 입력하세요!");
    const userCred = await signInAnonymously(auth);
    myUid = userCred.user.uid;
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('display-room').innerText = currentRoom;
    document.getElementById('display-name').innerText = myNickname;
    createBoards();
    listenToRoom();
};

document.getElementById('ready-btn').onclick = async () => {
    if (myShips.length < 5) return alert("모든 배를 배치해야 합니다!");
    const updates = {};
    updates[`rooms/${currentRoom}/players/${myUid}`] = {
        nickname: myNickname,
        ships: myShips.flat(),
        isReady: true
    };
    await update(ref(db), updates);
    document.getElementById('ready-btn').disabled = true;
    document.getElementById('ready-btn').innerText = "상대 대기 중...";
    checkGameStart();
};

async function checkGameStart() {
    const snapshot = await get(ref(db, `rooms/${currentRoom}/players`));
    const players = snapshot.val();
    if (players && Object.keys(players).length === 2) {
        const pIds = Object.keys(players);
        const allReady = pIds.every(id => players[id].isReady);
        if (allReady) {
            await update(ref(db, `rooms/${currentRoom}`), {
                status: 'playing',
                turn: pIds[Math.floor(Math.random() * 2)]
            });
        }
    }
}

function listenToRoom() {
    onValue(ref(db, `rooms/${currentRoom}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        const info = document.getElementById('game-info');
        gameState = data.status || 'setup';

        if (data.status === 'playing') {
            const isMyTurn = data.turn === myUid;
            info.innerText = isMyTurn ? "🔥 우리 팀 차례!" : "⏳ 상대 팀 공격 중...";
            renderBoards(data.players);
            checkWinner(data.players);
        } else if (data.status === 'finished') {
            info.innerText = `🏁 게임 종료! 승자: ${data.winnerNickname}`;
            renderBoards(data.players, true);
        }
    });
}

function renderBoards(players, showAll = false) {
    const enemyId = Object.keys(players).find(id => id !== myUid);
    if (!enemyId) return;
    const myData = players[myUid];
    const enemyData = players[enemyId];

    if (myData.attacks) {
        Object.keys(myData.attacks).forEach(id => {
            enemyBoardEl.children[id].className = `cell ${myData.attacks[id]}`;
        });
    }
    if (enemyData.attacks) {
        Object.keys(enemyData.attacks).forEach(id => {
            myBoardEl.children[id].className = `cell ship ${enemyData.attacks[id]}`;
        });
    }
    if (showAll && enemyData.ships) {
        enemyData.ships.forEach(id => {
            if (!enemyBoardEl.children[id].classList.contains('hit')) {
                enemyBoardEl.children[id].classList.add('ship');
            }
        });
    }
}

async function attack(cellId) {
    const snapshot = await get(ref(db, `rooms/${currentRoom}`));
    const data = snapshot.val();
    if (data.status !== 'playing' || data.turn !== myUid) return;
    
    const enemyId = Object.keys(data.players).find(id => id !== myUid);
    const enemyShips = data.players[enemyId].ships;
    const myAttacks = data.players[myUid].attacks || {};

    if (myAttacks[cellId]) return;

    const isHit = enemyShips.includes(parseInt(cellId));
    const result = isHit ? 'hit' : 'miss';
    
    const updates = {};
    updates[`rooms/${currentRoom}/players/${myUid}/attacks/${cellId}`] = result;
    if (!isHit) updates[`rooms/${currentRoom}/turn`] = enemyId;
    
    await update(ref(db), updates);
}

function checkWinner(players) {
    Object.keys(players).forEach(id => {
        const attacks = players[id].attacks || {};
        const hitCount = Object.values(attacks).filter(v => v === 'hit').length;
        if (hitCount === 12) {
            update(ref(db, `rooms/${currentRoom}`), {
                status: 'finished',
                winnerNickname: players[id].nickname
            });
        }
    });
}

document.getElementById('reset-btn').onclick = () => {
    if (prompt("암호입력") === "reset") {
        remove(ref(db, `rooms/${currentRoom}`));
        location.reload();
    }
};