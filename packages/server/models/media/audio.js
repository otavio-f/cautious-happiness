'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');

const Audio = masterDB.define('Audio',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        codec: {
            type: DataTypes.STRING,
            allowNull: false
        },
        duration: {
            type: DataTypes.INTEGER.UNSIGNED, // in milliseconds
            allowNull: false,
        },
        bitrate: {
            type: DataTypes.INTEGER.UNSIGNED, // in bps (floored)
            allowNull: false,
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Audio.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});


exports.Audio = Audio;