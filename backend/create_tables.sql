CREATE DATABASE seo_crawler;

\c seo_crawler;

CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Domains (
    domain_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES Users(user_id),
    url VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE URLs (
    url_id SERIAL PRIMARY KEY,
    domain_id INT REFERENCES Domains(domain_id),
    url VARCHAR(255) NOT NULL,
    http_status_code INT,
    canonical VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    last_crawled_at TIMESTAMP
);

CREATE TABLE InternalLinks (
    link_id SERIAL PRIMARY KEY,
    source_url_id INT REFERENCES URLs(url_id),
    target_url_id INT REFERENCES URLs(url_id)
);
