'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');


const Image = masterDB.define('Image',
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
        pixelFormat: {
            type: DataTypes.STRING,
            allowNull: false
        },
        width: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: false,
        },
        height: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: false,
        },
        pixels: {
            type: DataTypes.VIRTUAL,
            get() { return this.width * this.height; }
        },
        signature: {
            type: DataTypes.BLOB, // 32 bytes
            allowNull: false,
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Image.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

exports.Image = Image;
