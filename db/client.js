const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
    return pool.query(text, params);
}

async function one(text, params = []) {
    const { rows } = await query(text, params);
    return rows[0] || null;
}

async function many(text, params = []) {
    const { rows } = await query(text, params);
    return rows;
}

async function transaction(handler) {
    const client = await pool.connect();
    const helpers = {
        query: (text, params = []) => client.query(text, params),
        one: async (text, params = []) => {
            const { rows } = await client.query(text, params);
            return rows[0] || null;
        },
        many: async (text, params = []) => {
            const { rows } = await client.query(text, params);
            return rows;
        }
    };

    try {
        await client.query("BEGIN");
        const result = await handler(helpers);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query,
    one,
    many,
    transaction
};
