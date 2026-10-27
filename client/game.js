const authScreen = document.getElementById('auth-screen');
const roomScreen = document.getElementById('room-screen');
const homeScreen = document.getElementById('home-screen');
const gameScreen = document.getElementById('game-screen');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');

const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const authMsg = document.getElementById('auth-msg');

const dashUser = document.getElementById('dash-user');
const dashBalance = document.getElementById('dash-balance');
const dashRoom = document.getElementById('dash-room');
const roomList = document.getElementById('room-list');

const paystackPublicKey = 'pk_live_aa7de30f9ea76bfca9db7e3acf72a0b35d576f9a';
const depositBtn = document.getElementById('deposit-btn');
const withdrawBtn = document.getElementById('withdraw-btn');
const backToAuthBtn = document.getElementById('back-to-auth-btn');
const demoModeBtn = document.getElementById('demo-mode-btn');
const onlineMatchBtn = document.getElementById('online-match-btn');
const switchRoomBtn = document.getElementById('switch-room-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');

// Modal Elements
const withdrawModal = document.getElementById('withdraw-modal');
const confirmWithdrawBtn = document.getElementById('confirm-withdraw-btn');
const cancelWithdrawBtn = document.getElementById('cancel-withdraw-btn');
const withdrawMsg = document.getElementById('withdraw-msg');

const lblRoom = document.getElementById('lbl-room');
const lblPlayers = document.getElementById('lbl-players');
const lblWind = document.getElementById('lbl-wind');
const lblScore = document.getElementById('lbl-score');
const lblLastShot = document.getElementById('lbl-last-shot');
const lblJitter = document.getElementById('lbl-jitter');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Add Private Match Elements
const privateMatchBtn = document.getElementById('private-match-btn');
const privateModal = document.getElementById('private-modal');
const generateCodeBtn = document.getElementById('generate-code-btn');
const customRoomCode = document.getElementById('custom-room-code');
const joinPrivateBtn = document.getElementById('join-private-btn');
const cancelPrivateBtn = document.getElementById('cancel-private-btn');

const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeHistoryBtn = document.getElementById('close-history-btn');
const historyList = document.getElementById('history-list');

historyBtn.addEventListener('click', async () => {
    historyModal.classList.remove('hidden');
    historyList.innerHTML = '<p style="text-align: center; color: #94a3b8;">Loading transactions...</p>';

    try {
        const res = await fetch(`/api/transactions/${currentUserId}`);
        const data = await res.json();
        
        if (data.success && data.transactions.length > 0) {
            historyList.innerHTML = '';
            data.transactions.forEach(tx => {
                const item = document.createElement('div');
                item.style.cssText = 'background: #0f172a; padding: 8px; margin-bottom: 6px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155;';
                
                const color = tx.type === 'DEPOSIT' ? '#4ade80' : '#f59e0b';
                item.innerHTML = `
                    <div>
                        <b style="color: ${color};">${tx.type}</b><br>
                        <span style="font-size: 11px; color: #64748b;">${tx.created_at}</span>
                    </div>
                    <div style="font-weight: bold; color: ${color};">
                        ${tx.type === 'DEPOSIT' ? '+' : '-'}₦${parseFloat(tx.amount).toFixed(2)}
                    </div>
                `;
                historyList.appendChild(item);
            });
        } else {
            historyList.innerHTML = '<p style="text-align: center; color: #94a3b8;">No transaction records found yet.</p>';
        }
    } catch (err) {
        historyList.innerHTML = '<p style="text-align: center; color: #ef4444;">Failed to load history.</p>';
    }
});

closeHistoryBtn.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});
const syncBtn = document.getElementById('sync-btn');

syncBtn.addEventListener('click', async () => {
    syncBtn.textContent = 'Syncing...';
    try {
        const res = await fetch('/api/paystack/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId })
        });
        const data = await res.json();
        if (data.success) {
            currentBalance = parseFloat(data.balance);
            dashBalance.textContent = currentBalance.toFixed(2);
            alert(data.message);
        } else {
            alert(data.error || 'No new deposit detected.');
        }
    } catch (err) {
        alert('Network error during sync.');
    } finally {
        syncBtn.textContent = '🔄 Sync';
    }
});


// Open Private Match Modal
privateMatchBtn.addEventListener('click', () => {
    privateModal.classList.remove('hidden');
    customRoomCode.value = '';
});

cancelPrivateBtn.addEventListener('click', () => {
    privateModal.classList.add('hidden');
});

// Generate Random 1v1 Invite Code
generateCodeBtn.addEventListener('click', () => {
    const randomCode = 'DUEL-' + Math.floor(1000 + Math.random() * 9000);
    customRoomCode.value = randomCode;
});

// Connect to 1v1 Private Room
joinPrivateBtn.addEventListener('click', () => {
    const roomCode = customRoomCode.value.trim().toUpperCase();
    if (!roomCode) {
        alert('Please generate or enter a room code.');
        return;
    }

    privateModal.classList.add('hidden');
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');

    currentRoom = roomCode;
    lblRoom.textContent = currentRoom + ' (1v1)';

    ws = new WebSocket(`ws://${window.location.hostname}:3000`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ 
            action: 'JOIN_ROOM', 
            roomCode: currentRoom, 
            username: currentUser,
            maxPlayers: 2 // Enforce 2 players for 1v1 private match
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'ERROR') {
            alert(data.message);
            leaveGame();
        }
        if (data.type === 'PLAYER_JOINED') {
            lblPlayers.textContent = data.playersCount;
            lblWind.textContent = data.wind;
        }
        if (data.type === 'SHOT_RESULT' && data.username === currentUser) {
            lblScore.textContent = data.totalScore;
            lblLastShot.textContent = data.points;
        }
    };
});

let ws = null;
let currentUserId = null;
let currentUser = null;
let currentBalance = 0;
let currentRoom = '';
let isDemoMode = false;

let isAiming = false;
let startX = 70;
let startY = 130;
let currentX = 70;
let currentY = 130;

let sensorJitter = 0.0;
window.addEventListener('deviceorientation', (event) => {
    if (event.beta !== null && event.gamma !== null) {
        sensorJitter = Math.abs(event.beta - 45) * 0.04 + Math.abs(event.gamma) * 0.04;
        lblJitter.textContent = sensorJitter.toFixed(1);
    }
});

tabLoginBtn.addEventListener('click', () => switchTab('login'));
tabRegisterBtn.addEventListener('click', () => switchTab('register'));

function switchTab(tab) {
    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabLoginBtn.classList.add('active-tab');
        tabRegisterBtn.classList.remove('active-tab');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabRegisterBtn.classList.add('active-tab');
        tabLoginBtn.classList.remove('active-tab');
    }
    authMsg.textContent = '';
}

registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    if (!username || !email || !password) {
        authMsg.style.color = '#ef4444';
        authMsg.textContent = 'Please fill all fields.';
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (data.success) {
            authMsg.style.color = '#4ade80';
            authMsg.textContent = data.message;
            setTimeout(() => switchTab('login'), 1500);
        } else {
            authMsg.style.color = '#ef4444';
            authMsg.textContent = data.error;
        }
    } catch (err) {
        authMsg.style.color = '#ef4444';
        authMsg.textContent = 'Connection error.';
    }
});

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!username || !password) {
        authMsg.style.color = '#ef4444';
        authMsg.textContent = 'Enter username and password.';
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            currentUserId = data.user.id;
            currentUser = data.user.username;
            currentBalance = parseFloat(data.wallet.balance);

            authScreen.classList.add('hidden');
            roomScreen.classList.remove('hidden');
            loadRooms();
        } else {
            authMsg.style.color = '#ef4444';
            authMsg.textContent = data.error;
        }
    } catch (err) {
        authMsg.style.color = '#ef4444';
        authMsg.textContent = 'Connection error.';
    }
});

async function loadRooms() {
    try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        roomList.innerHTML = '';

        data.rooms.forEach(code => {
            const card = document.createElement('div');
            card.className = 'room-card';
            card.innerHTML = `
                <span>🎯 <b>${code}</b></span>
                <button class="select-room-btn" data-room="${code}">Select Room</button>
            `;
            roomList.appendChild(card);
        });

        document.querySelectorAll('.select-room-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                selectRoom(e.target.getAttribute('data-room'));
            });
        });
    } catch (err) {
        roomList.innerHTML = '<p style="color:#ef4444;">Failed to load rooms.</p>';
    }
}

function selectRoom(roomCode) {
    currentRoom = roomCode;
    dashUser.textContent = currentUser;
    dashBalance.textContent = currentBalance.toFixed(2);
    dashRoom.textContent = currentRoom;

    roomScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
}

// Deposit Button Handler
depositBtn.addEventListener('click', async () => {
    const amt = prompt('Enter deposit amount (Min ₦100):', '100');
    if (!amt) return;
    const amount = parseFloat(amt);

    if (isNaN(amount) || amount < 100) {
        alert('Minimum deposit amount is ₦100.');
        return;
    }

    try {
        const res = await fetch('/api/paystack/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUserId, amount: amount })
        });
        const data = await res.json();
        if (data.success && data.authorization_url) {
            window.location.href = data.authorization_url;
        } else {
            alert(data.error || 'Could not initialize payment.');
        }
    } catch (err) {
        alert('Network error connecting to payment gateway.');
    }
});

// Withdrawal Modal Triggers
withdrawBtn.addEventListener('click', () => {
    withdrawModal.classList.remove('hidden');
    withdrawMsg.textContent = '';
});

cancelWithdrawBtn.addEventListener('click', () => {
    withdrawModal.classList.add('hidden');
});

confirmWithdrawBtn.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('w-amount').value);
    const accountNumber = document.getElementById('w-account').value.trim();
    const bankCode = document.getElementById('w-bank').value;

    if (isNaN(amount) || amount <= 0) {
        withdrawMsg.style.color = '#ef4444';
        withdrawMsg.textContent = 'Enter a valid withdrawal amount.';
        return;
    }

    if (amount > currentBalance) {
        withdrawMsg.style.color = '#ef4444';
        withdrawMsg.textContent = 'Insufficient wallet balance.';
        return;
    }

    if (!accountNumber || accountNumber.length !== 10) {
        withdrawMsg.style.color = '#ef4444';
        withdrawMsg.textContent = 'Account number must be 10 digits.';
        return;
    }

    withdrawMsg.style.color = '#38bdf8';
    withdrawMsg.textContent = 'Processing transfer...';

    try {
        const res = await fetch('/api/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUserId,
                amount: amount,
                accountNumber: accountNumber,
                bankCode: bankCode
            })
        });

        const data = await res.json();
        if (data.success) {
            currentBalance = parseFloat(data.balance);
            dashBalance.textContent = currentBalance.toFixed(2);
            withdrawMsg.style.color = '#4ade80';
            withdrawMsg.textContent = data.message;
            setTimeout(() => withdrawModal.classList.add('hidden'), 1500);
        } else {
            withdrawMsg.style.color = '#ef4444';
            withdrawMsg.textContent = data.error || 'Withdrawal failed.';
        }
    } catch (err) {
        withdrawMsg.style.color = '#ef4444';
        withdrawMsg.textContent = 'Network error during withdrawal.';
    }
});

backToAuthBtn.addEventListener('click', () => { roomScreen.classList.add('hidden'); authScreen.classList.remove('hidden'); });
switchRoomBtn.addEventListener('click', () => { homeScreen.classList.add('hidden'); roomScreen.classList.remove('hidden'); });

demoModeBtn.addEventListener('click', () => {
    isDemoMode = true;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    lblRoom.textContent = currentRoom + ' (Demo)';
    lblPlayers.textContent = '1 (Solo)';
    lblWind.textContent = '0.00';
    drawGame();
});

onlineMatchBtn.addEventListener('click', () => {
    isDemoMode = false;
    homeScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    lblRoom.textContent = currentRoom;

    ws = new WebSocket(`ws://${window.location.hostname}:3000`);
    ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'JOIN_ROOM', roomCode: currentRoom, username: currentUser }));
    };
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'PLAYER_JOINED') {
            lblPlayers.textContent = data.playersCount;
            lblWind.textContent = data.wind;
        }
        if (data.type === 'SHOT_RESULT' && data.username === currentUser) {
            lblScore.textContent = data.totalScore;
            lblLastShot.textContent = data.points;
        }
    };
});

leaveGameBtn.addEventListener('click', () => {
    if (ws) ws.close();
    gameScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
});

// Canvas Drag Controls
canvas.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
canvas.addEventListener('mouseup', () => releaseShot());

canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); });
canvas.addEventListener('touchmove', (e) => { const t = e.touches[0]; drag(t.clientX, t.clientY); });
canvas.addEventListener('touchend', () => releaseShot());

function getCoords(cx, cy) {
    const r = canvas.getBoundingClientRect();
    return {
        x: (cx - r.left) * (canvas.width / r.width),
        y: (cy - r.top) * (canvas.height / r.height)
    };
}

function startDrag(cx, cy) {
    const c = getCoords(cx, cy);
    if (Math.hypot(c.x - startX, c.y - startY) < 50) isAiming = true;
}

function drag(cx, cy) {
    if (!isAiming) return;
    const c = getCoords(cx, cy);
    currentX = c.x;
    currentY = c.y;
    drawGame();
}

function releaseShot() {
    if (!isAiming) return;
    isAiming = false;

    const dx = startX - currentX;
    const dy = startY - currentY;
    const power = Math.hypot(dx, dy) + (sensorJitter * 2);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI) + (sensorJitter * 0.5);

    if (isDemoMode) {
        const dist = Math.abs(70 - power);
        let pts = dist <= 8 ? 10 : dist <= 20 ? 8 : dist <= 38 ? 6 : dist <= 55 ? 4 : 2;
        let currentTotal = parseInt(lblScore.textContent) + pts;
        lblScore.textContent = currentTotal;
        lblLastShot.textContent = pts;
    } else {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'SHOOT', roomCode: currentRoom, angle, power }));
        }
    }

    currentX = startX;
    currentY = startY;
    drawGame();
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const targetX = 390;
    const targetY = 110;
    const colors = ['#ef4444', '#ffffff', '#ef4444', '#3b82f6', '#1e293b'];
    const radii = [45, 35, 25, 13, 5];

    radii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(targetX, targetY, r, 0, Math.PI * 2);
        ctx.fillStyle = colors[idx];
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(startX - 15, startY - 35, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(startX - 15, startY - 25);
    ctx.lineTo(startX - 15, startY + 15);
    ctx.moveTo(startX - 15, startY + 15);
    ctx.lineTo(startX - 25, startY + 45);
    ctx.moveTo(startX - 15, startY + 15);
    ctx.lineTo(startX - 5, startY + 45);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(startX, startY, 30, -Math.PI / 1.5, Math.PI / 1.5);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 5;
    ctx.stroke();

    const topBowY = startY - 26;
    const botBowY = startY + 26;

    if (isAiming) {
        ctx.beginPath();
        ctx.moveTo(startX, topBowY);
        ctx.lineTo(currentX, currentY);
        ctx.lineTo(startX, botBowY);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineTo(currentX + 70, currentY - (currentY - startY) * 0.5);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(currentX + 65, currentY - (currentY - startY) * 0.5 - 4, 8, 8);
    } else {
        ctx.beginPath();
        ctx.moveTo(startX, topBowY);
        ctx.lineTo(startX, botBowY);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

drawGame();
