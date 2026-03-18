const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PushSubscription = sequelize.define('PushSubscription', {
  endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
  subscription: { type: DataTypes.TEXT, allowNull: false }, // full JSON stringified subscription object
});

module.exports = PushSubscription;
