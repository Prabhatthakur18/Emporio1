const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,     // Make sure these environment variables are set in Vercel
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function getDBConnection() {
    return pool.getConnection();
}

module.exports = { getDBConnection };
