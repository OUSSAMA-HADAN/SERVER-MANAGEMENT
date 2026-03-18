const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

const DB_PATH = path.join(__dirname, '../../data/serverctrl.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sequelize = new Sequelize({ dialect: 'sqlite', storage: DB_PATH, logging: false });

module.exports = sequelize;
