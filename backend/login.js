const readline = require('readline');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const performDomainOperations = require('./perform_domain_operations');

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

async function loginUser() {
  try {
    const username = await askQuestion('Enter username: ');
    const password = await askQuestion('Enter password: ');

    const result = await client.query('SELECT * FROM Users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      console.error('Invalid username or password');
      client.end();
      rl.close();
      return;
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.error('Invalid username or password');
      client.end();
      rl.close();
      return;
    }

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Login successful. Token:', token);
    return { token, userId: user.user_id };
  } catch (error) {
    console.error('Error logging in user:', error);
  } finally {
    rl.close();
  }
}

loginUser().then(credentials => {
  if (credentials) {
    performDomainOperations(credentials.token, credentials.userId);
  }
});
