const mysql = require('mysql2/promise');
require('dotenv').config(); // Load environment variables

// Create MySQL connection pool
const pool = mysql.createPool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Function to get a database connection
const getDBConnection = async () => {
    return await pool.getConnection();
};

module.exports = { getDBConnection, pool };
