'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../db/master.js');

const Namespace = masterDB.define('Namespace', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    value: {
        type: DataTypes.STRING(128),
        allowNull: false
    }
});

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
    }
});

Tag.belongsTo(Namespace, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    foreignKey: {
        name: 'namespace',
        allowNull: false
    },
});

module.exports = { Namespace, Tag };