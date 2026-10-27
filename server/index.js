require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Database Connection
const db = new sqlite3.Database('./game.db', (err) => {
  if (err) console.error('Database Connection Error:', err.message);
  else console.log('Connected to SQLite database successfully.');
});

// Create Required Tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    balance REAL DEFAULT 0.0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    amount REAL,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Active Rooms State
const rooms = {};

// Default Preset Rooms
const defaultRooms = ['Archery-Arena-101', 'Bullseye-Pro-202', 'Master-Aim-303', 'Speed-Shot-404', 'Grand-Tourney-505'];

// --- ROUTES ---

// 1. Get Room List
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: defaultRooms });
});

// 2. Register Route
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hashedPassword], function(err) {
      if (err) return res.status(400).json({ error: 'Username or email already exists' });
      
      const userId = this.lastID;
      db.run(`INSERT INTO wallets (user_id, balance) VALUES (?, 1000.0)`, [userId], () => {
        db.run(`INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'DEPOSIT', 1000.0, 'SUCCESS')`);
        res.json({ success: true, message: 'Registration successful! Bonus ₦1000 added.' });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 3. Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [user.id], (err, wallet) => {
      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email },
        wallet: { balance: wallet ? wallet.balance : 0.0 }
      });
    });
  });
});

// 4. Paystack Deposit Initialization Route (Min ₦100)
app.post('/api/paystack/initialize', async (req, res) => {
  const { userId, amount } = req.body;

  if (!amount || amount < 100) {
    return res.status(400).json({ error: 'Minimum deposit amount is ₦100' });
  }

  db.get(`SELECT email FROM users WHERE id = ?`, [userId], async (err, user) => {
    if (err || !user || !user.email) {
      return res.status(400).json({ error: 'User account email not found' });
    }

    try {
      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email: user.email,
          amount: amount * 100, // Convert to kobo
          callback_url: `http://${req.headers.host}/api/paystack/verify`
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      res.json({ success: true, authorization_url: response.data.data.authorization_url });
    } catch (paystackErr) {
      console.error('Paystack Error:', paystackErr.response ? paystackErr.response.data : paystackErr.message);
      res.status(500).json({ error: 'Failed to initialize payment gateway' });
    }
  });
});

// 5. Paystack Deposit Verification Route
app.get('/api/paystack/verify', async (req, res) => {
  const { reference } = req.query;

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const txData = response.data.data;
    if (txData.status === 'success') {
      const email = txData.customer.email;
      const amountPaid = txData.amount / 100;

      db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (user) {
          db.run(`UPDATE wallets SET balance = balance + ? WHERE user_id = ?`, [amountPaid, user.id], () => {
            db.run(`INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'DEPOSIT', ?, 'SUCCESS')`, [user.id, amountPaid]);
            res.redirect('/?deposit=success');
          });
        } else {
          res.redirect('/?deposit=error');
        }
      });
    } else {
      res.redirect('/?deposit=failed');
    }
  } catch (err) {
    res.status(500).send('Payment verification failed');
  }
});
// Sync / Verify recent live deposits manually from Paystack
app.post('/api/paystack/sync', async (req, res) => {
  const { userId } = req.body;

  db.get(`SELECT email FROM users WHERE id = ?`, [userId], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'User not found' });

    try {
      // Fetch recent transactions from Paystack live API
      const response = await axios.get('https://api.paystack.co/transaction?perPage=5', {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
      });

      const transactions = response.data.data;
      // Find latest successful transaction for this user's email
      const validTx = transactions.find(t => t.customer.email === user.email && t.status === 'success');

      if (validTx) {
        const amount = validTx.amount / 100;
        
        // Check if this reference was already credited
        db.get(`SELECT id FROM transactions WHERE amount = ? AND type = 'DEPOSIT' AND created_at >= datetime('now', '-1 hour')`, [amount], (txErr, existing) => {
          if (!existing) {
            db.run(`UPDATE wallets SET balance = balance + ? WHERE user_id = ?`, [amount, userId]);
            db.run(`INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'DEPOSIT', ?, 'SUCCESS')`, [userId, amount]);
            
            db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [userId], (balErr, w) => {
              res.json({ success: true, balance: w.balance, message: `Successfully synced ₦${amount} deposit!` });
            });
          } else {
            res.json({ success: false, error: 'Deposit already credited.' });
          }
        });
      } else {
        res.json({ success: false, error: 'No recent successful live deposit found on Paystack.' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to sync with Paystack' });
    }
  });
});


// 6. Withdrawal Route
// 6. Live Mode Withdrawal & Transfer Route
app.post('/api/withdraw', async (req, res) => {
  const { userId, amount, accountNumber, bankCode } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }

  db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [userId], async (err, wallet) => {
    if (err || !wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ error: 'Account number and bank selection are required' });
    }

    try {
      // Step 1: Resolve account name via Paystack Live API to ensure correct NUBAN & Bank Code
      const resolveRes = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      if (!resolveRes.data.status) {
        return res.status(400).json({ error: 'Could not resolve bank account. Please check your account number and bank.' });
      }

      const accountName = resolveRes.data.data.account_name;

      // Step 2: Create Transfer Recipient on Live Paystack
      const recipientRes = await axios.post(
        'https://api.paystack.co/transferrecipient',
        {
          type: 'nuban',
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN'
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      const recipientCode = recipientRes.data.data.recipient_code;

      // Step 3: Initiate Live Transfer
      const transferRes = await axios.post(
        'https://api.paystack.co/transfer',
        {
          source: 'balance',
          amount: amount * 100, // Convert to kobo
          recipient: recipientCode,
          reason: 'Archery Showdown Winnings Payout'
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      // Step 4: Deduct balance and record successful transaction only after successful live transfer initiation
      db.run(`UPDATE wallets SET balance = balance - ? WHERE user_id = ?`, [amount, userId], function (dbErr) {
        if (dbErr) return res.status(500).json({ error: 'Database update failed' });

        db.run(
          `INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'WITHDRAWAL', ?, 'SUCCESS')`,
          [userId, amount]
        );

        db.get(`SELECT balance FROM wallets WHERE user_id = ?`, [userId], (err, updatedWallet) => {
          res.json({
            success: true,
            balance: updatedWallet.balance,
            message: `Live payout of ₦${amount} to ${accountName} initiated successfully!`
          });
        });
      });

    } catch (paystackErr) {
      console.error('Paystack Live Transfer Error:', paystackErr.response ? paystackErr.response.data : paystackErr.message);
      const errorMsg = paystackErr.response && paystackErr.response.data && paystackErr.response.data.message 
        ? paystackErr.response.data.message 
        : 'Live transfer failed. Check account details or business payout limits.';
      
      return res.status(400).json({ error: errorMsg });
    }
  });
});

// 7. Transaction History Route
app.get('/api/transactions/:userId', (req, res) => {
  const { userId } = req.params;
  db.all(`SELECT type, amount, status, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20`, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch transaction history' });
    res.json({ success: true, transactions: rows || [] });
  });
});

// --- WEBSOCKET ENGINE ---
function broadcastToRoom(roomCode, data) {
  if (rooms[roomCode]) {
    rooms[roomCode].players.forEach(player => {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(JSON.stringify(data));
      }
    });
  }
}

function calculateShotScore(angle, power, wind) {
  const targetX = 390;
  const targetY = 110;
  const startX = 70;
  const startY = 130;

  const rad = angle * (Math.PI / 180);
  const vx = Math.cos(rad) * (power * 0.15);
  const vy = Math.sin(rad) * (power * 0.15);

  const landX = startX + (vx * 20) + (wind * 10);
  const landY = startY - (vy * 20);

  const dist = Math.hypot(landX - targetX, landY - targetY);
  let points = dist <= 12 ? 10 : dist <= 25 ? 8 : dist <= 40 ? 6 : dist <= 60 ? 4 : 2;
  return { points, distance: dist.toFixed(2) };
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.action === 'JOIN_ROOM') {
        const { roomCode, username, maxPlayers } = data;
        const capacity = maxPlayers || 7;

        if (!rooms[roomCode]) {
          rooms[roomCode] = {
            players: [],
            wind: (Math.random() * 8 - 4).toFixed(2),
            capacity: capacity
          };
        }

        if (rooms[roomCode].players.length >= rooms[roomCode].capacity) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Room is full' }));
          return;
        }

        rooms[roomCode].players.push({ ws, username, score: 0 });
        ws.roomCode = roomCode;
        ws.username = username;

        broadcastToRoom(roomCode, {
          type: 'PLAYER_JOINED',
          playersCount: `${rooms[roomCode].players.length}/${rooms[roomCode].capacity}`,
          wind: rooms[roomCode].wind
        });
      }

      if (data.action === 'SHOOT') {
        const { roomCode, angle, power } = data;
        const room = rooms[roomCode];
        if (!room) return;

        const result = calculateShotScore(angle, power, parseFloat(room.wind));
        const player = room.players.find(p => p.ws === ws);
        if (player) player.score += result.points;

        broadcastToRoom(roomCode, {
          type: 'SHOT_RESULT',
          username: ws.username,
          points: result.points,
          totalScore: player ? player.score : 0,
          distance: result.distance
        });
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms[ws.roomCode]) {
      rooms[ws.roomCode].players = rooms[ws.roomCode].players.filter(p => p.ws !== ws);
      if (rooms[ws.roomCode].players.length === 0) delete rooms[ws.roomCode];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
