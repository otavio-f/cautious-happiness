'use strict';

const {Sequelize} = require("sequelize");
const dotenv = require("dotenv/config.js");

let path = process.env.NODE_ENV?.toLowerCase().startsWith('dev')
    ?process.env.DB_TEST_PATH
    :process.env.MASTER_DB_PATH;

/**
 * Initializes the database
 * @param {string} path
 * @returns {Sequelize}
 */
exports.masterDB = new Sequelize({
    dialect: 'sqlite',
    storage: path
});