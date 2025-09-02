'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');


const Video = masterDB.define('Video',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        codec: {
            type: DataTypes.STRING,
            allowNull: false,
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
            get() {return this.width * this.height;}
        },
        frames: {
            type: DataTypes.INTEGER.UNSIGNED, // frame count
            allowNull: false,
        },
        fps: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        duration: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        bitrate: {
            type: DataTypes.INTEGER.UNSIGNED, // in bps (floored)
            allowNull: false,
        },
        audioCodec: {
            type: DataTypes.STRING, // can be null if there's no audio
        },
        audioBitrate: {
            type: DataTypes.INTEGER.UNSIGNED, // in bps (floored)
            defaultValue: 0 // zero means no audio
        },
        hasAudio: {
            type: DataTypes.VIRTUAL,
            get() { return this.audioBitrate > 0; }
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Video.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

// TODO: VideoSignatures

exports.Video = Video;
