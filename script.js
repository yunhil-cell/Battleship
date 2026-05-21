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
    databaseURL: "https://battleship-f08f8-default-rtdb.asia-southeast1.firebasedatabase.app/"
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
        const currentBtn = e.currentTarget;
        if (currentBtn.classList.contains('placed')) return; // 이미 배치된 배는 선택 무시
        
        document.querySelectorAll('.ship-btn').forEach(b => b.classList.remove('selected'));
        currentBtn.classList.add('selected');
        selectedShipSize = parseInt(currentBtn.dataset.size);
        selectedShipBtn = currentBtn;
    };
});

let selectedShipBtn = null;
document.getElementById('rotate-btn').onclick = (e) => {
    isHorizontal = !isHorizontal;
    e.target.innerText = isHorizontal ? "방향: 가로" : "방향: 세로";
};

function placeShip(startId) {
    if (gameState !== 'setup') return;

    // 1. 이미 배가 있는 곳을 누르면 해당 배를 취소(삭제)
    if (myBoardEl.children[startId].classList.contains('ship')) {
        const shipIndex = myShips.findIndex(ship => ship.cells.includes(parseInt(startId)));
        if (shipIndex !== -1) {
            const targetShip = myShips[shipIndex];
            targetShip.cells.forEach(id => {
                deployedCells.delete(id);
                myBoardEl.children[id].classList.remove('ship');
            });
            // 버튼 재활성화
            targetShip.btn.classList.remove('placed');
            targetShip.btn.style.opacity = '1';
            targetShip.btn.style.cursor = 'pointer';
            myShips.splice(shipIndex, 1);
        }
        return;
    }

    // 2. 새 배 배치 로직
    if (!selectedShipSize || !selectedShipBtn) return;
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
    // 취소를 위해 버튼 정보를 함께 저장
    myShips.push({ cells, btn: selectedShipBtn });
    
    // 배치된 버튼 비활성화 (시각적 처리 포함)
    selectedShipBtn.classList.add('placed');
    selectedShipBtn.style.opacity = '0.3';
    selectedShipBtn.style.cursor = 'not-allowed';
    selectedShipBtn.classList.remove('selected');
    
    selectedShipSize = null;
    selectedShipBtn = null;
}

async function enterGame(roomCode, isCreating) {
    myNickname = document.getElementById('nickname').value;
    if (!myNickname) return alert("팀명을 입력하세요!");

    try {
        const roomRef = ref(db, `rooms/${roomCode}`);
        const roomSnapshot = await get(roomRef);
        const roomData = roomSnapshot.val();

        if (isCreating) {
            if (roomData) return alert("이미 존재하는 방 코드입니다. 다시 시도하세요.");
            myTeam = 'red'; // 방장은 무조건 홍팀
        } else {
            if (!roomData) return alert("존재하지 않는 입장 코드입니다.");
            if (roomData.status === 'playing') return alert("⚠️ 이미 교전이 시작된 방입니다.");
            if (roomData.status === 'finished') return alert("🏁 이미 종료된 게임입니다.");
            const playerCount = roomData.players ? Object.keys(roomData.players).length : 0;
            if (playerCount >= 2) return alert("🚫 방이 가득 찼습니다.");
            myTeam = 'blue'; // 참여자는 무조건 청팀
        }

        currentRoom = roomCode;
        document.body.classList.add(myTeam === 'red' ? 'team-red' : 'team-blue');
        const userCred = await signInAnonymously(auth);
        myUid = userCred.user.uid;

        await set(ref(db, `rooms/${currentRoom}/players/${myUid}`), {
            nickname: myNickname,
            isReady: false,
            team: myTeam
        });

        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        // 상태바에 방 번호 표시
        document.getElementById('display-room').innerText = `코드: ${currentRoom}`;
        document.getElementById('display-name').innerText = `${myNickname} (${myTeam === 'red' ? '홍팀' : '청팀'})`;

        createBoards();
        listenToRoom();
    } catch (error) {
        alert("접속 실패! 네트워크를 확인하세요.");
    }
}

document.getElementById('create-room-btn').onclick = () => {
    // 1000 ~ 9999 사이의 4자리 랜덤 숫자 코드 생성
    const randomCode = Math.floor(1000 + Math.random() * 9000).toString(); 
    enterGame(randomCode, true);
};

document.getElementById('join-room-btn').onclick = () => {
    const codeInput = document.getElementById('join-code').value.trim();
    if (!codeInput) return alert("입장 코드를 입력하세요.");
    enterGame(codeInput, false);
};

document.getElementById('ready-btn').onclick = async () => {
    if (myShips.length < 5) return alert("모든 배를 배치해야 합니다!");
    const updates = {};
    // 함선 형체를 유지하여 저장 (2차원 배열 구조)
    updates[`rooms/${currentRoom}/players/${myUid}/ships`] = myShips.map(s => s.cells);
    updates[`rooms/${currentRoom}/players/${myUid}/isReady`] = true;
    
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
        const info = document.getElementById('game-info');
        
        // 방 데이터가 삭제된 경우
        if (!data) {
            if (gameState === 'finished') {
                alert("게임이 종료되어 대기실로 이동합니다.");
            } else if (gameState !== 'setup') {
                alert("방이 강제 초기화되었습니다.");
            }
            location.reload();
            return;
        }

        if (!data.players) {
            info.innerText = "상대방을 기다리는 중...";
            return;
        }

        const players = data.players;
        const pIds = Object.keys(players);
        const enemyId = pIds.find(id => id !== myUid);
        
        // 피격 감지(화면 흔들림)는 이전 단계에서 누락하셨다면 여기에 추가할 수 있습니다.
        
        gameState = data.status || 'setup';

        if (gameState === 'setup') {
            if (pIds.length === 1) {
                info.innerText = `친구에게 입장코드 [${currentRoom}]을 알려주세요!`;
            } else if (pIds.length === 2) {
                const enemyName = players[enemyId].nickname;
                const enemyReady = players[enemyId].isReady ? "✅준비완료" : "📝배치중";
                info.innerText = `상대 팀 [${enemyName}] 접속됨 (${enemyReady})`;
            }
        } else if (gameState === 'playing') {
            const isMyTurn = data.turn === myUid;
            info.innerText = isMyTurn ? "🔥 우리 팀 차례!" : `⏳ 상대(${players[enemyId].nickname}) 공격 중...`;
            renderBoards(data.players);
            checkWinner(data.players);
        } else if (gameState === 'finished') {
            const isWinner = data.winnerNickname === myNickname;
            info.innerText = isWinner ? "🏆 승리했습니다! (5초 후 종료)" : "💀 패배했습니다... (5초 후 종료)";
            renderBoards(data.players, true);
            
            // 승리한 기기에서만 5초 후 방을 삭제 (양쪽 다 동시에 삭제명령을 보내면 꼬일 수 있으므로)
            if (isWinner) {
                setTimeout(async () => {
                    await remove(ref(db, `rooms/${currentRoom}`));
                }, 5000);
            }
        }
    });
}

// 생존 현황판 그리기 함수
function updateShipStatus(containerId, ships, attacks) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!ships) return;
    
    ships.forEach(shipCells => {
        // 배의 모든 칸이 hit 상태인지 확인 (침몰 여부)
        const isSunk = shipCells.every(id => attacks && attacks[id] === 'hit');
        const shipDiv = document.createElement('div');
        shipDiv.className = `status-ship ${isSunk ? 'sunk' : ''}`;
        
        shipCells.forEach(() => {
            const cell = document.createElement('div');
            cell.className = 'sc';
            shipDiv.appendChild(cell);
        });
        container.appendChild(shipDiv);
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
        enemyData.ships.flat().forEach(id => {
            if (!enemyBoardEl.children[id].classList.contains('hit')) {
                enemyBoardEl.children[id].classList.add('ship');
            }
        });
    }

    // 아군/적군 현황판 업데이트
    updateShipStatus('my-ship-status', myData.ships, enemyData.attacks);
    updateShipStatus('enemy-ship-status', enemyData.ships, myData.attacks);
}

async function attack(cellId) {
    const snapshot = await get(ref(db, `rooms/${currentRoom}`));
    const data = snapshot.val();
    if (data.status !== 'playing' || data.turn !== myUid) return;
    
    const enemyId = Object.keys(data.players).find(id => id !== myUid);
    const enemyShips = data.players[enemyId].ships;
    const myAttacks = data.players[myUid].attacks || {};

    if (myAttacks[cellId]) return;

    // 2차원 배열이므로 flat() 처리 후 확인
    const isHit = enemyShips.flat().includes(parseInt(cellId));
    
    if (isHit) {
        if (navigator.vibrate) navigator.vibrate([200, 50, 200]);
        document.body.classList.add('hit-flash');
        setTimeout(() => document.body.classList.remove('hit-flash'), 200);
    }

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

// 첫 화면 전체 리셋 (비밀번호 마스킹 처리)
const globalResetBtn = document.getElementById('global-reset-btn');
if (globalResetBtn) {
    globalResetBtn.onclick = async () => {
        const pw = document.getElementById('global-reset-pw').value;
        const room = document.getElementById('room-select').value;
        if (pw === "reset") {
            await remove(ref(db, `rooms/${room}`));
            alert(`${room} 방이 강제 초기화 되었습니다.`);
            document.getElementById('global-reset-pw').value = '';
        } else {
            alert("비밀번호가 틀렸습니다.");
        }
    };
}