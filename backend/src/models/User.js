const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  // Base32 TOTP secret; null = 2FA not enrolled
  totpSecret: { type: DataTypes.STRING, allowNull: true },
});

/** sequelize.sync() never adds columns to existing tables — do it here. */
User.migrate = async () => {
  const [cols] = await sequelize.query('PRAGMA table_info(Users)');
  if (cols.length && !cols.some((c) => c.name === 'totpSecret')) {
    await sequelize.query('ALTER TABLE Users ADD COLUMN totpSecret VARCHAR(255)');
  }
};

module.exports = User;
