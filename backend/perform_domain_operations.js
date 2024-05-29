const { Client } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

client.connect();

async function insertDomains(userId) {
  const domains = ['https://example1.com', 'https://example2.com'];
  const domainIds = [];

  for (const url of domains) {
    const result = await client.query(
      'INSERT INTO Domains (user_id, url) VALUES ($1, $2) RETURNING domain_id',
      [userId, url]
    );
    domainIds.push(result.rows[0].domain_id);
  }

  return domainIds;
}

async function insertURL(domainId) {
  const urlData = {
    url: 'https://example1.com/page1',
    http_status_code: 200,
    canonical: 'https://example1.com/page1',
    title: 'Example Page 1',
    description: 'Description of page 1'
  };

  const result = await client.query(
    'INSERT INTO URLs (domain_id, url, http_status_code, canonical, title, description, last_crawled_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING url_id',
    [domainId, urlData.url, urlData.http_status_code, urlData.canonical, urlData.title, urlData.description]
  );

  return result.rows[0].url_id;
}

async function performDomainOperations(token, userId) {
  try {
    // Verify token (for demonstration purposes, usually this would be done in middleware)
    jwt.verify(token, process.env.JWT_SECRET);

    const domainIds = await insertDomains(userId);
    console.log('Domains inserted:', domainIds);

    const urlId = await insertURL(domainIds[0]);
    console.log('URL inserted with ID:', urlId);

    await checkData();
  } catch (error) {
    console.error('Error performing domain operations:', error);
  } finally {
    client.end();
  }
}

async function checkData() {
  try {
    const users = await client.query('SELECT * FROM Users');
    console.log('Users:', users.rows);

    const domains = await client.query('SELECT * FROM Domains');
    console.log('Domains:', domains.rows);

    const urls = await client.query('SELECT * FROM URLs');
    console.log('URLs:', urls.rows);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

module.exports = performDomainOperations;
