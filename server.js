const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config(); // Load environment variables

const app = express();

app.use(cors());
app.use(express.json()); // Middleware to parse JSON requests

// MySQL connection pool
const pool = mysql.createPool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 100, // Optimized limit
    queueLimit: 0, // Unlimited queue
});

// Global Error Handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Root route
app.get('/', (req, res) => {
    res.json("Backend is running");
});

// **Health Check Route**
app.get('/health', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.ping();
        res.status(200).json({ message: "Database connection is healthy" });
    } catch (err) {
        console.error('Database connection failed:', err);
        res.status(500).json({ message: "Database connection failed", error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get all cities**
app.get('/autoform', async (req, res) => {
    const sql = "SELECT * FROM cities";
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get all states**
app.get('/getallstate', async (req, res) => {
    const sql = "SELECT * FROM states";
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get cities by state ID**
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;

    if (!state_id) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    const sql = "SELECT * FROM cities WHERE StateID = ?";
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql, [state_id]);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get stores by city ID**
app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;

    if (!cityid) {
        return res.status(400).json({ message: 'City ID is required' });
    }

    const sql = "SELECT * FROM autoform WHERE CityID = ?";
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql, [cityid]);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get stores by city name**
app.post('/getStorebyname', async (req, res) => {
    const { cityname } = req.body;

    if (!cityname) {
        return res.status(400).json({ message: 'City name is required' });
    }

    const sql = `SELECT * FROM autoform WHERE CityID IN (SELECT CityID FROM cities WHERE cityname = ?)`;
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql, [cityname]);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// **Get stores by state name (Fixed query)**
app.post('/getStorebyState', async (req, res) => {
    const { statename } = req.body;

    if (!statename) {
        return res.status(400).json({ message: 'State name is required' });
    }

    const sql = `SELECT * FROM autoform WHERE StateID IN (SELECT StateID FROM states WHERE statename = ?)`;
    let connection;
    try {
        connection = await pool.getConnection();
        const [data] = await connection.query(sql, [statename]);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error', error: err.message });
    } finally {
        if (connection) connection.release();
    }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
