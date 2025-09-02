'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');


const Archive = masterDB.define('Archive',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        description: {
            type: DataTypes.STRING(512), // short description of contents
            allowNull: false,
            defaultValue: ""
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Archive.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

exports.Archive = Archive;