const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "database-2.cw9s6awi6bw4.us-east-1.rds.amazonaws.com",
    user: "admin",
    password: "xSPlwRbeV5ktuhzW3P1p",
    database: "quincevictoria", // Cambia esto si tu base tiene otro nombre
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function query(text, params = []) {
    const [rows] = await pool.execute(text, params);
    return rows;
}

async function one(text, params = []) {
    const rows = await query(text, params);
    return rows[0] || null;
}

async function many(text, params = []) {
    return query(text, params);
}

async function transaction(handler) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const helpers = {
            query: (text, params = []) => connection.execute(text, params).then(([rows]) => rows),
            one: async (text, params = []) => {
                const [rows] = await connection.execute(text, params);
                return rows[0] || null;
            },
            many: async (text, params = []) => {
                const [rows] = await connection.execute(text, params);
                return rows;
            }
        };
        const result = await handler(helpers);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = { query, one, many, transaction };
