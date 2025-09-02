'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../db/master.js');


const StorageIndex = masterDB.define('StorageIndex',{
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    file: {
        type: DataTypes.STRING(65536), // relative path, utf-8
        allowNull: false,
        unique: true
    }
});

module.exports = { StorageIndex };