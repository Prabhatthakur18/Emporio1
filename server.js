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
    connectionLimit: 35,
    queueLimit: 100,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
});

// Helper function to manage database connections
async function withConnection(callback) {
    let connection;
    try {
        connection = await pool.getConnection();
        return await callback(connection);
    } finally {
        if (connection) connection.release();
    }
}

// Email credentials
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

// Route: Database connection status
app.get('/dbstatus', async (req, res) => {
    try {
        const status = await withConnection(async (connection) => {
            const [rows] = await connection.query('SHOW STATUS WHERE Variable_name = "Threads_connected"');
            return rows;
        });
        res.json({ 
            status: "OK", 
            activeConnections: status[0].Value,
            poolConfig: {
                connectionLimit: pool.config.connectionLimit,
                queueLimit: pool.config.queueLimit
            }
        });
    } catch (err) {
        console.error('Database status check failed:', err);
        res.status(500).json({ status: "ERROR", message: err.message });
    }
});

// Route: Send OTP - FIXED VERSION
app.post('/api/sendOTP', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry
    
    try {
        await withConnection(async (connection) => {
            // Use INSERT ... ON DUPLICATE KEY UPDATE to handle existing emails
            // This will either insert new record or update existing one
            await connection.query(`
                INSERT INTO otp_verification (email, otp, expires_at, created_at) 
                VALUES (?, ?, ?, NOW()) 
                ON DUPLICATE KEY UPDATE 
                otp = VALUES(otp), 
                expires_at = VALUES(expires_at), 
                created_at = NOW()
            `, [email, otp, expiresAt]);
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
        console.error('Error sending OTP:', err);
        res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
    }
});

// Route: Verify OTP - ENHANCED VERSION
app.post('/api/verifyOTP', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    try {
        const record = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                'SELECT * FROM otp_verification WHERE email = ? ORDER BY created_at DESC LIMIT 1', 
                [email]
            );
            return rows[0];
        });

        if (!record) return res.status(400).json({ success: false, message: 'No OTP found for this email' });
        if (record.otp.toString() !== otp.toString()) return res.status(400).json({ success: false, message: 'Invalid OTP' });
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
        }

        // Optional: Mark OTP as used to prevent reuse
        await withConnection(async (connection) => {
            await connection.query(
                'UPDATE otp_verification SET used = 1 WHERE email = ? AND otp = ?',
                [email, otp]
            );
        });

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (err) {
        console.error('OTP verification error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Route: Submit rating - FIXED VERSION
app.post('/api/submitRating', async (req, res) => {
    const { StoreID, mobile, email, rating, submitted_at, name } = req.body;
  
    if (!email || !rating) {
        return res.status(400).json({ success: false, message: 'Email and rating are required' });
    }
  
    try {
        // First, verify that the OTP was validated for this email
        const otpVerified = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                'SELECT * FROM otp_verification WHERE email = ? AND used = 1 ORDER BY created_at DESC LIMIT 1',
                [email]
            );
            return rows.length > 0;
        });

        if (!otpVerified) {
            return res.status(400).json({ success: false, message: 'Please verify your email first' });
        }

        // Check if user already submitted rating for this store
        const existingRating = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                'SELECT * FROM ratings WHERE email = ? AND StoreID = ?',
                [email, StoreID]
            );
            return rows[0];
        });

        if (existingRating) {
            // Update existing rating instead of creating new one
            await withConnection(async (connection) => {
                await connection.query(
                    'UPDATE ratings SET rating = ?, submitted_at = ?, name = ?, mobile = ? WHERE email = ? AND StoreID = ?',
                    [rating, submitted_at || new Date().toISOString(), name || null, mobile || null, email, StoreID]
                );
            });
            res.json({ success: true, message: 'Rating updated successfully' });
        } else {
            // Insert new rating
            await withConnection(async (connection) => {
                await connection.query(
                    'INSERT INTO ratings (StoreID, mobile, email, rating, submitted_at, name) VALUES (?, ?, ?, ?, ?, ?)',
                    [StoreID, mobile || null, email, rating, submitted_at || new Date().toISOString(), name || null]
                );
            });
            res.json({ success: true, message: 'Rating submitted successfully' });
        }
    } catch (err) {
        console.error('Submit rating error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Route: Get store timings
app.post('/getStoreTimings', async (req, res) => {
    const { storeid } = req.body;
    if (!storeid) return res.status(400).json({ message: 'Store ID is required' });

    const today = new Date().toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                `SELECT ?? AS timings, Closed FROM timings WHERE StoreID = ?`,
                [today, storeid]
            );
            return rows;
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

// Route: Get all cities
app.get('/autoform', async (req, res) => {
    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query("SELECT * FROM cities");
            return rows;
        });
        
        res.json(data);
    } catch (err) {
        console.error('Cities fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Get ratings for a specific store
app.get('/getRatings/:StoreID', async (req, res) => {
    const { StoreID } = req.params;
    
    try {
        const results = await withConnection(async (connection) => {
            // Get average rating
            const [avgResult] = await connection.query(
                'SELECT AVG(rating) as averageRating FROM ratings WHERE StoreID = ?',
                [StoreID]
            );
            
            // Get rating count
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
            averageRating: parseFloat(results.averageRating).toFixed(1),
            ratingCount: results.ratingCount
        });
    } catch (err) {
        console.error('Error fetching ratings:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all ratings for a store (optional - for detailed display)
app.get('/getAllRatings/:StoreID', async (req, res) => {
    const { StoreID } = req.params;
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const results = await withConnection(async (connection) => {
            // Get paginated ratings
            const [ratings] = await connection.query(
                'SELECT * FROM ratings WHERE StoreID = ? ORDER BY submitted_at DESC LIMIT ? OFFSET ?',
                [StoreID, parseInt(limit), offset]
            );
            
            // Get total count
            const [countResult] = await connection.query(
                'SELECT COUNT(*) as total FROM ratings WHERE StoreID = ?',
                [StoreID]
            );
            
            return {
                ratings,
                total: countResult[0].total
            };
        });
        
        res.json({
            ratings: results.ratings,
            total: results.total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error('Error fetching all ratings:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Route: Get all states
app.get('/getallstate', async (req, res) => {
    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query("SELECT * FROM states");
            return rows;
        });
        
        res.json(data);
    } catch (err) {
        console.error('States fetch error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    }
});

// Route: Get cities by state
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;
    if (!state_id) return res.status(400).json({ message: 'State ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                "SELECT * FROM cities WHERE StateID = ? ORDER BY CityName ASC", 
                [state_id]
            );
            return rows;
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

// Route: Get stores by city ID
app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;
    if (!cityid) return res.status(400).json({ message: 'City ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                "SELECT * FROM autoform WHERE CityID = ? ORDER BY StoreName ASC", 
                [cityid]
            );
            return rows;
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

// Route: Get stores by city name
app.post('/getStorebyname', async (req, res) => {
    const { cityname } = req.body;
    if (!cityname) return res.status(400).json({ message: 'City name is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                "SELECT * FROM autoform WHERE CityID = (SELECT CityID FROM cities WHERE cityname = ?) ORDER BY StoreName ASC", 
                [cityname]
            );
            return rows;
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

// Route: Get stores by state name
app.post('/getStorebyState', async (req, res) => {
    const { stateid } = req.body;
    if (!stateid) return res.status(400).json({ message: 'State ID is required' });

    try {
        const data = await withConnection(async (connection) => {
            const [rows] = await connection.query(
                "SELECT * FROM autoform WHERE stateid = (SELECT stateid FROM states WHERE statename = ?) ORDER BY StoreName ASC", 
                [stateid]
            );
            return rows;
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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        message: 'Internal server error', 
        error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message 
    });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Database connection pool configured with limit: ${pool.config.connectionLimit}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Closing database connections and shutting down...');
    pool.end((err) => {
        if (err) {
            console.error('Error closing pool:', err);
            process.exit(1);
        }
        console.log('Database pool closed successfully');
        process.exit(0);
    });
});
