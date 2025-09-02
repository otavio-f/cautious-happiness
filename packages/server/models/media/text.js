'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');


const Text = masterDB.define('Text',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        length: {
            type: DataTypes.INTEGER.UNSIGNED, // in characters
            allowNull: false,
        },
        wc: {
            type: DataTypes.INTEGER.UNSIGNED, // word count
            allowNull: false,
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Text.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

exports.Text = Text;
