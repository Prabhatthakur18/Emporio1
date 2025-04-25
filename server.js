const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

// MySQL database connection pool
const pool = mysql.createPool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 1000, // High limit (adjust as per server capacity)
    queueLimit: 0, // Unlimited queue
});

app.get('/', (req, res) => {
    res.json({ message: "Backend is running!" });
});



// Email credentials (replace with your real ones)
const EMAIL_USER = 'marketing@autoformindia.com';
const EMAIL_PASS = 'lpzx kisj eeow zpkb';

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// Helper: Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

// Route: Health check
app.get('/', (req, res) => {
    res.json({ message: "Backend is running!" });
});

// Route: Send OTP
app.post('/api/sendOTP', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // expires in 3 mins

    try {
        const connection = await pool.getConnection();
        await connection.query('INSERT INTO otp_verification (email, otp, expires_at) VALUES (?, ?, ?)', [email, otp, expiresAt]);
        connection.release();

        const mailOptions = {
            from: EMAIL_USER,
            to: email,
            subject: 'Your OTP for Rating Submission',
            text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ success: false, message: 'Failed to send OTP email' });
            }
            console.log('Email sent:', info.response);
            res.json({ success: true, message: 'OTP sent to your email' });
        });

    } catch (err) {
        console.error('Error storing OTP:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


// Route: Verify OTP
app.post('/api/verifyOTP', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM otp_verification WHERE email = ? ORDER BY created_at DESC LIMIT 1', [email]);
        connection.release();

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

// Route: Submit rating
// Route: Submit rating
app.post('/api/submitRating', async (req, res) => {
    const {name, mobile, email, rating, submitted_at } = req.body;

    if (!name || !mobile || !email || !rating || !submitted_at) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const connection = await pool.getConnection();
        await connection.query('INSERT INTO ratings (name, mobile, email, rating, submitted_at) VALUES (?, ?, ?, ?, ?)', [name, mobile, email, rating, submitted_at || null]);
        connection.release();

        res.json({ message: 'Rating submitted successfully' });
    } catch (err) {
        console.error('Submit rating error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Route: Get store timings
app.post('/getStoreTimings', async (req, res) => {
    const { storeid } = req.body;
    if (!storeid) return res.status(400).json({ message: 'Store ID is required' });

    const today = new Date().toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

    const sql = `SELECT ?? AS timings, Closed FROM timings WHERE StoreID = ?`;
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql, [today, storeid]);
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
    } finally {
        if (connection) connection.release();
    }
});

// Route: Get all cities
app.get('/autoform', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM cities");
        connection.release();
        res.json(data);
    } catch (err) {
        console.error('Cities fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

// Route: Get all states
app.get('/getallstate', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM states");
        connection.release();
        res.json(data);
    } catch (err) {
        console.error('States fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

// Route: Get cities by state
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;
    if (!state_id) return res.status(400).json({ message: 'State ID is required' });

    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM cities WHERE StateID = ?", [state_id]);
        connection.release();

        if (data.length === 0) {
            return res.status(404).json({ message: 'No cities found for the given state ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch cities by state error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route: Get stores by city ID
app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;
    if (!cityid) return res.status(400).json({ message: 'City ID is required' });

    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM autoform WHERE CityID = ?", [cityid]);
        connection.release();

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch store error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route: Get stores by city name
app.post('/getStorebyname', async (req, res) => {
    const { cityname } = req.body;
    if (!cityname) return res.status(400).json({ message: 'City name is required' });

    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM autoform WHERE CityID = (SELECT CityID FROM cities WHERE cityname = ?)", [cityname]);
        connection.release();

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city name' });
        }
        res.json(data);
    } catch (err) {
        console.error('Fetch store by name error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route: Get stores by state name
app.post('/getStorebyState', async (req, res) => {
    const { stateid } = req.body;
    if (!stateid) return res.status(400).json({ message: 'State ID is required' });

    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT * FROM autoform WHERE stateid = (SELECT stateid FROM states WHERE statename = ?)", [stateid]);
        connection.release();

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
