    'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../db/master.js');

const Tag = masterDB.define('Tag', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    value: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    namespace: {
        type: DataTypes.STRING(64),
        allowNull: false
    }
},
  {
      indexes: [{
          unique: true,
          fields: ['value', 'namespace'],
          name: 'unique_namespace_to_tag'
      }]
});

module.exports = { Tag };