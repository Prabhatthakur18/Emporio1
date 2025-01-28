const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config(); // Load environment variables

const app = express();

app.use(cors());
app.use(express.json()); // Middleware to parse JSON requests

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

// Root route
app.get('/', (req, res) => {
    res.json("From backend side running");
});

// Get all cities
app.get('/autoform', async (req, res) => {
    const sql = "SELECT * FROM cities";
    try {
        const [data] = await pool.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

// Get all states
app.get('/getallstate', async (req, res) => {
    const sql = "SELECT * FROM states";
    try {
        const [data] = await pool.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error', error: err });
    }
});

// Get cities by state ID
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;

    if (!state_id) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    const sql = "SELECT * FROM cities WHERE StateID = ?";
    try {
        const [data] = await pool.query(sql, [state_id]);
        if (data.length === 0) {
            return res.status(404).json({ message: 'No cities found for the given state ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get stores by city ID
app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;

    if (!cityid) {
        return res.status(400).json({ message: 'City ID is required' });
    }

    const sql = "SELECT * FROM autoform WHERE CityID = ?";
    try {
        const [data] = await pool.query(sql, [cityid]);
        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city ID' });
        }
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get stores by city name
app.post('/getStorebyname', async (req, res) => {
    const { cityname } = req.body;

    if (!cityname) {
        return res.status(400).json({ message: 'City name is required' });
    }

    const sql = `SELECT * FROM autoform WHERE CityID = (SELECT CityID FROM cities WHERE cityname = ?)`;
    try {
        const [data] = await pool.query(sql, [cityname]);
        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city name' });
        }
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get stores by state name
app.post('/getStorebyState', async (req, res) => {
    const { stateid } = req.body;

    if (!stateid) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    const sql = `SELECT * FROM autoform WHERE stateid = (SELECT stateid FROM states WHERE statename = ?)`;
    try {
        const [data] = await pool.query(sql, [stateid]);
        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given state name' });
        }
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}/Listening`);
});
