const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

// MySQL database connection pool with optimized settings
const pool = mysql.createPool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 30, // Adjusted to a safer limit
    queueLimit: 50, // Limited queue to prevent memory issues
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 10000, // 10 seconds
    acquireTimeout: 10000, // 10 seconds
    idleTimeout: 60000 // 60 seconds idle timeout
});

// Pool event listeners for monitoring
pool.on('connection', (connection) => {
    console.log('New DB connection established');
});

pool.on('acquire', (connection) => {
    console.log('Connection %d acquired', connection.threadId);
});

pool.on('release', (connection) => {
    console.log('Connection %d released', connection.threadId);
});

pool.on('enqueue', () => {
    console.log('Waiting for available connection slot');
});

pool.on('error', (err) => {
    console.error('Pool error:', err);
});

// Connection helper function
async function withConnection(fn) {
    let connection;
    try {
        connection = await pool.getConnection();
        return await fn(connection);
    } finally {
        if (connection) connection.release();
    }
}

// Email configuration
const EMAIL_USER = 'marketing@autoformindia.com';
const EMAIL_PASS = 'lpzx kisj eeow zpkb';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Helper functions
const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: "Backend is running!" });
});

// Database status endpoint
app.get('/db-status', async (req, res) => {
    try {
        const stats = pool.pool.config;
        const currentConnections = pool._freeConnections.length;
        const inUseConnections = stats.connectionLimit - currentConnections;
        
        res.json({
            status: 'healthy',
            connectionLimit: stats.connectionLimit,
            currentConnections,
            inUseConnections,
            queueSize: pool._connectionQueue.length
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// OTP endpoints
app.post('/api/sendOTP', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    
    try {
        await withConnection(async (connection) => {
            await connection.query(
                'INSERT INTO otp_verification (email, otp, expires_at) VALUES (?, ?, ?)', 
                [email, otp, expiresAt]
            );
        });

        const mailOptions = {
            from: EMAIL_USER,
            to: email,
            subject: 'Your OTP for Rating Submission',
            text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'OTP sent to your email' });
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/api/verifyOTP', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    try {
        const [rows] = await withConnection(async (connection) => {
            return await connection.query(
                'SELECT * FROM otp_verification WHERE email = ? ORDER BY created_at DESC LIMIT 1', 
                [email]
            );
        });

        if (rows.length === 0) return res.status(400).json({ success: false, message: 'No OTP found' });

        const record = rows[0];
        if (record.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });

        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (err) {
        console.error('OTP verification error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Rating endpoints
app.post('/api/submitRating', async (req, res) => {
    const { StoreID, mobile, email, rating, submitted_at, name } = req.body;
  
    if (!mobile || !email || !rating || !submitted_at) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
  
    try {
        await withConnection(async (connection) => {
            await connection.query(
                'INSERT INTO ratings (StoreID, mobile, email, rating, submitted_at, name) VALUES (?, ?, ?, ?, ?, ?)',
                [StoreID, mobile, email, rating, submitted_at || null, name || null]
            );
        });
  
        res.json({ message: 'Rating submitted successfully' });
    } catch (err) {
        console.error('Submit rating error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.get('/getRatings/:StoreID', async (req, res) => {
    const { StoreID } = req.params;
    
    try {
        const result = await withConnection(async (connection) => {
            const [avgResult] = await connection.query(
                'SELECT AVG(rating) as averageRating FROM ratings WHERE StoreID = ?',
                [StoreID]
            );
            
            const [countResult] = await connection.query(
                'SELECT COUNT(*) as ratingCount FROM ratings WHERE StoreID = ?',
                [StoreID]
            );
            
            return {
                averageRating: avgResult[0].averageRating || 0,
                ratingCount: countResult[0].ratingCount || 0
            };
        });
        
        res.json({
            averageRating: parseFloat(result.averageRating).toFixed(1),
            ratingCount: result.ratingCount
        });
    } catch (err) {
        console.error('Error fetching ratings:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Store endpoints
app.post('/getStoreTimings', async (req, res) => {
    const { storeid } = req.body;
    if (!storeid) return res.status(400).json({ message: 'Store ID is required' });

    const today = new Date().toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
    const sql = `SELECT ?? AS timings, Closed FROM timings WHERE StoreID = ?`;
    
    try {
        const [data] = await withConnection(async (connection) => {
            return await connection.query(sql, [today, storeid]);
        });

        if (data.length === 0 || !data[0].timings) {
            return res.status(404).json({ message: 'No timings found for this store today' });
        }
        
        res.json({
            storeid,
            today,
            timings: data[0].timings,
            closed: data[0].Closed
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    }
});

// Location endpoints
app.get('/autoform', async (req, res) => {
    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query("SELECT * FROM cities");
            return result;
        });
        res.json(data);
    } catch (err) {
        console.error('Cities fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

app.get('/getallstate', async (req, res) => {
    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query("SELECT * FROM states");
            return result;
        });
        res.json(data);
    } catch (err) {
        console.error('States fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;
    if (!state_id) return res.status(400).json({ message: 'State ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query(
                "SELECT * FROM cities WHERE StateID = ?", 
                [state_id]
            );
            return result;
        });

        if (data.length === 0) {
            return res.status(404).json({ message: 'No cities found for the given state ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch cities by state error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;
    if (!cityid) return res.status(400).json({ message: 'City ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query(
                "SELECT * FROM autoform WHERE CityID = ?", 
                [cityid]
            );
            return result;
        });

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch store error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/getStorebyname', async (req, res) => {
    const { cityname } = req.body;
    if (!cityname) return res.status(400).json({ message: 'City name is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query(
                "SELECT * FROM autoform WHERE CityID = (SELECT CityID FROM cities WHERE cityname = ?)", 
                [cityname]
            );
            return result;
        });

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city name' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch store by name error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

app.post('/getStorebyState', async (req, res) => {
    const { stateid } = req.body;
    if (!stateid) return res.status(400).json({ message: 'State ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [result] = await connection.query(
                "SELECT * FROM autoform WHERE stateid = (SELECT stateid FROM states WHERE statename = ?)", 
                [stateid]
            );
            return result;
        });

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given state name' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch store by state error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
