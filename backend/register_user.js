const readline = require('readline');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

client.connect();

async function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function registerUser() {
  try {
    const username = await askQuestion('Enter username: ');
    const password = await askQuestion('Enter password: ');
    const email = await askQuestion('Enter email: ');

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await client.query(
      'INSERT INTO Users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING user_id',
      [username, hashedPassword, email]
    );

    const userId = result.rows[0].user_id;
    console.log(`User registered successfully with ID: ${userId}`);
  } catch (error) {
    console.error('Error registering user:', error);
  } finally {
    client.end();
    rl.close();
  }
}

registerUser();
