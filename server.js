const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config(); // Load environment variables

const app = express();

app.use(cors());
app.use(express.json()); // Middleware to parse JSON requests

// MySQL database connection pool
const db = mysql.createPool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 2000,
    waitForConnections: true,
    queueLimit: 0
});

// Check database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        process.exit(1); // Exit if database connection fails
    }
    console.log('Connected to the database');
    connection.release(); // Release the connection after check
});

// Root route
app.get('/', (req, res) => {
    res.json("From backend side running");
});

// Get all cities
app.get('/autoform', (req, res) => {
    const sql = "SELECT * FROM cities";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Database error', error: err });
        }
        res.json(data);
    });
});

// Get all states
app.get('/getallstate', (req, res) => {
    const sql = "SELECT * FROM states";
    db.query(sql, (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Database error', error: err });
        }
        res.json(data);
    });
});

// Get cities by state ID
app.post('/getCitiesByState', (req, res) => {
    const { state_id } = req.body;

    if (!state_id) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    const sql = "SELECT * FROM cities WHERE StateID = ?";
    db.query(sql, [state_id], (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (data.length === 0) {
            return res.status(404).json({ message: 'No cities found for the given state ID' });
        }

        res.json(data);
    });
});

// Get stores by city ID
app.post('/getStore', (req, res) => {
    const { cityid } = req.body;

    if (!cityid) {
        return res.status(400).json({ message: 'City ID is required' });
    }

    const sql = "SELECT * FROM autoform WHERE CityID = ?";
    db.query(sql, [cityid], (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city ID' });
        }

        res.json(data);
    });
});

// Get stores by city name
app.post('/getStorebyname', (req, res) => {
    const { cityname } = req.body;

    if (!cityname) {
        return res.status(400).json({ message: 'City name is required' });
    }

    const sql = `SELECT * FROM autoform WHERE CityID = (SELECT CityID FROM cities WHERE cityname = ?)`;
    db.query(sql, [cityname], (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given city name' });
        }

        res.json(data);
    });
});

// Get stores by state name
app.post('/getStorebyState', (req, res) => {
    const { stateid } = req.body;

    if (!stateid) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    const sql = `SELECT * FROM autoform WHERE stateid = (SELECT stateid FROM states WHERE statename = ?)`;
    db.query(sql, [stateid], (err, data) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (data.length === 0) {
            return res.status(404).json({ message: 'No stores found for the given state name' });
        }

        res.json(data);
    });
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}/Listening`);
});
