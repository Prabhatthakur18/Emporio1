const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MySQL Database Connection
const pool = mysql.createPool({
    host: 'localhost', // Change to your DB host
    user: 'root', // Your DB username
    password: '', // Your DB password
    database: 'your_database_name', // Change to your DB name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Fetch All States
app.get('/getallstate', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query("SELECT * FROM states");
        connection.release();
        res.json(rows);
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Fetch State Description
app.post('/getStateDescription', async (req, res) => {
    const { stateid } = req.body;

    if (!stateid) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    try {
        const connection = await pool.getConnection();
        const [data] = await connection.query("SELECT Description FROM states WHERE StateID = ?", [stateid]);
        connection.release();

        if (data.length === 0) {
            return res.status(404).json({ message: 'No description found' });
        }

        res.json({ Description: data[0].Description });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Fetch Cities by State
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;

    if (!state_id) {
        return res.status(400).json({ message: 'State ID is required' });
    }

    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query("SELECT * FROM cities WHERE StateID = ?", [state_id]);
        connection.release();
        res.json(rows);
    } catch (error) {
        console.error('Error fetching cities:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
