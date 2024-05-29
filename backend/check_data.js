const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

client.connect();

async function checkData() {
  try {
    const result = await client.query('SELECT * FROM Users');
    console.log('Users:', result.rows);
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    client.end();
  }
}

checkData();
