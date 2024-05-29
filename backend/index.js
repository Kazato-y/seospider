const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(bodyParser.json());

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

client.connect()
  .then(() => {
    console.log('Connected to the database');
  })
  .catch(err => {
    console.error('Database connection error', err.stack);
  });

const handleError = (res, error, message) => {
  console.error(message, error);
  res.status(500).json({ error: message });
};

// ユーザー登録API
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await client.query(
      'INSERT INTO Users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING user_id',
      [username, hashedPassword, email]
    );

    const userId = result.rows[0].user_id;
    res.status(201).json({ userId });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Login API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  console.log('Logging in user:', username);

  try {
    const result = await client.query('SELECT * FROM Users WHERE username = $1', [username]);
    console.log('Query result:', result.rows);

    if (result.rows.length === 0) {
      console.error('Invalid username');
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.error('Invalid password');
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('JWT Token:', token);

    res.json({ token, userId: user.user_id });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});


// Domain Registration API
app.post('/api/domains', async (req, res) => {
  const { url } = req.body;
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const result = await client.query(
      'INSERT INTO Domains (user_id, url) VALUES ($1, $2) RETURNING domain_id, url',
      [userId, url]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    handleError(res, error, 'Failed to add domain');
  }
});

// Fetch Domains API
app.get('/api/domains', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const result = await client.query('SELECT domain_id, url FROM Domains WHERE user_id = $1', [userId]);
    res.json(result.rows);
  } catch (error) {
    handleError(res, error, 'Failed to fetch domains');
  }
});

// Delete Domain API
app.delete('/api/domains/:domainId', async (req, res) => {
  const { domainId } = req.params;
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const result = await client.query(
      'DELETE FROM Domains WHERE domain_id = $1 AND user_id = $2 RETURNING domain_id',
      [domainId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found or not authorized' });
    }
    res.json({ message: 'Domain deleted successfully' });
  } catch (error) {
    handleError(res, error, 'Failed to delete domain');
  }
});

// Fetch Domain Details API
app.get('/api/domains/:domainId', async (req, res) => {
  const { domainId } = req.params;
  try {
    const domainResult = await client.query('SELECT * FROM Domains WHERE domain_id = $1', [domainId]);
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }
    
    const domainData = domainResult.rows[0];
    const urlResult = await client.query('SELECT * FROM URLs WHERE domain_id = $1 ORDER BY last_crawled_at DESC LIMIT 1', [domainId]);
    if (urlResult.rows.length > 0) {
      const urlData = urlResult.rows[0];
      domainData.lastCrawledAt = urlData.last_crawled_at;
      domainData.httpStatusCode = urlData.http_status_code;
      domainData.canonical = urlData.canonical;
      domainData.title = urlData.title;
      domainData.description = urlData.description;
    } else {
      domainData.lastCrawledAt = null;
      domainData.httpStatusCode = null;
      domainData.canonical = null;
      domainData.title = null;
      domainData.description = null;
    }
    res.json(domainData);
  } catch (error) {
    handleError(res, error, 'Failed to fetch domain details');
  }
});

// Fetch Domain URLs API
app.get('/api/domains/:domainId/urls', async (req, res) => {
  const { domainId } = req.params;
  try {
    const result = await client.query('SELECT * FROM URLs WHERE domain_id = $1', [domainId]);
    res.json(result.rows);
  } catch (error) {
    handleError(res, error, 'Failed to fetch URLs');
  }
});

// Crawling API
app.post('/api/crawl', async (req, res) => {
  const { domainId, url } = req.body;
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const pythonScript = path.join(__dirname, 'crawl.py');
    const command = `python ${pythonScript} ${url}`;
    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Python script: ${error.message}`);
        return res.status(500).json({ error: 'Failed to crawl the website' });
      }
      if (stderr) {
        console.error(`Python script stderr: ${stderr}`);
      }
      
      const results = JSON.parse(fs.readFileSync('crawl_results.json', 'utf-8'));
      for (const result of results) {
        const { url, title, status_code, canonical, description, internal_links } = result;
        
        const urlResult = await client.query(
          'INSERT INTO URLs (domain_id, url, http_status_code, canonical, title, description, last_crawled_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING url_id',
          [domainId, url, status_code, canonical, title, description]
        );
        const urlId = urlResult.rows[0].url_id;

        for (const link of internal_links) {
          await client.query(
            'INSERT INTO InternalLinks (source_url_id, target_url_id) VALUES ($1, (SELECT url_id FROM URLs WHERE url = $2 LIMIT 1))',
            [urlId, link]
          );
        }
      }
      
      console.log(`Finished crawl for domain: ${url}`);
      res.json(results);
    });
  } catch (error) {
    handleError(res, error, 'Failed to crawl the website');
  }
});

// Fetch Internal Links API
app.get('/api/urls/:urlId/internal-links', async (req, res) => {
  const { urlId } = req.params;
  try {
    const result = await client.query('SELECT target_url_id FROM InternalLinks WHERE source_url_id = $1', [urlId]);
    const internalLinks = await Promise.all(result.rows.map(async row => {
      const urlResult = await client.query('SELECT url FROM URLs WHERE url_id = $1', [row.target_url_id]);
      if (urlResult.rows.length > 0) {
        return urlResult.rows[0].url;
      }
      return null;
    }));
    const filteredLinks = internalLinks.filter(link => link !== null);
    res.json(filteredLinks);
  } catch (error) {
    handleError(res, error, 'Failed to fetch internal links');
  }
});

// Fetch URLs that Link to Given URL API
app.get('/api/urls/:urlId/linked-by', async (req, res) => {
  const { urlId } = req.params;
  try {
    const result = await client.query(`
      SELECT source.url
      FROM InternalLinks
      JOIN URLs AS source ON InternalLinks.source_url_id = source.url_id
      WHERE InternalLinks.target_url_id = $1
    `, [urlId]);
    res.json(result.rows.map(row => row.url));
  } catch (error) {
    handleError(res, error, 'Failed to fetch linking URLs');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
