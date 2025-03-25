const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

//  Optimized MySQL Connection Pool
let pool;
async function getDBConnection() {
    if (!pool) {
        pool = mysql.createPool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0
        });
    }
    return pool.getConnection();
}

// Root Route
app.get('/', (req, res) => {
    res.json("Backend is running successfully!");
});

//  Get State Description
app.post('/getStateDescription', async (req, res) => {
    const { city_name, state_name } = req.body;
    
    if (!city_name && !state_name) {
        return res.status(400).json({ message: 'City name or State name is required' });
    }

    let connection;
    try {
        connection = await getDBConnection();

        let stateId = null;

        // If city_name is provided, get StateID from cities table
        if (city_name) {
            const getStateIdQuery = "SELECT StateID FROM cities WHERE CityName = ?";
            const [stateData] = await connection.query(getStateIdQuery, [city_name]);
            if (stateData.length === 0) {
                return res.status(404).json({ message: 'City not found' });
            }
            stateId = stateData[0].StateID;
        }

        // If state_name is provided, get StateID directly
        if (state_name) {
            const getStateQuery = "SELECT StateID FROM states WHERE StateName = ?";
            const [stateData] = await connection.query(getStateQuery, [state_name]);
            if (stateData.length === 0) {
                return res.status(404).json({ message: 'State not found' });
            }
            stateId = stateData[0].StateID;
        }

        // Fetch Description using StateID
        const getStateDescQuery = "SELECT Description FROM states WHERE StateID = ?";
        const [descData] = await connection.query(getStateDescQuery, [stateId]);
        if (descData.length === 0) {
            return res.status(404).json({ message: 'State description not found' });
        }

        res.json({ description: descData[0].Description });

    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});


// Get All Cities
app.get('/autoform', async (req, res) => {
    const sql = "SELECT * FROM cities";
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Get All States
app.get('/getallstate', async (req, res) => {
    const sql = "SELECT * FROM states";
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql);
        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Database error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Get Cities by State ID
app.post('/getCitiesByState', async (req, res) => {
    const { state_id } = req.body;
    if (!state_id) return res.status(400).json({ message: 'State ID is required' });

    const sql = "SELECT * FROM cities WHERE StateID = ?";
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql, [state_id]);
        if (data.length === 0) return res.status(404).json({ message: 'No cities found for the given state ID' });

        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Get Stores by City ID
app.post('/getStore', async (req, res) => {
    const { cityid } = req.body;
    if (!cityid) return res.status(400).json({ message: 'City ID is required' });

    const sql = "SELECT * FROM autoform WHERE CityID = ?";
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql, [cityid]);
        if (data.length === 0) return res.status(404).json({ message: 'No stores found for the given city ID' });

        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Get Stores by State ID
app.post('/getStorebyState', async (req, res) => {
    const { stateid } = req.body;
    if (!stateid) return res.status(400).json({ message: 'State ID is required' });

    const sql = "SELECT * FROM autoform WHERE StateID = ?";
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql, [stateid]);
        if (data.length === 0) return res.status(404).json({ message: 'No stores found for the given state ID' });

        res.json(data);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Get Store Timings Based on Current Day
app.post('/getStoreTimings', async (req, res) => {
    const { storeid } = req.body;
    if (!storeid) return res.status(400).json({ message: 'Store ID is required' });

    // Get today's day name dynamically
    const today = new Date().toLocaleString('en-US', { weekday: 'long' }).toLowerCase();

    const sql = `SELECT ${today} AS timings FROM timings WHERE StoreID = ?`;
    let connection;
    try {
        connection = await getDBConnection();
        const [data] = await connection.query(sql, [storeid]);
        if (data.length === 0 || !data[0].timings) return res.status(404).json({ message: 'No timings found for this store today' });

        res.json({ storeid, today, timings: data[0].timings });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        if (connection) connection.release();
    }
});

//  Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
