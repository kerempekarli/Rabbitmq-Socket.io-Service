const { Pool } = require("pg");

// Veritabanı ayarları
const pool = new Pool({
  user: process.env.DB_USER ? process.env.DB_USER : "postgres",
  host: process.env.DB_USER ? process.env.DB_USER : "localhost",
  database: process.env.DB_NAME ? process.env.DB_NAME : "E-Commerce App",
  password: "123456",
  port: process.env.DB_PORT ? process.env.DB_PORT : 5432,
});

module.exports = pool;
