'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Media } = require('./media.js');


const Thumbnail = masterDB.define('Thumbnail',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        data: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'Base64 representation of a scaled down 128px webp thumbnail' +
                'use the following command to create thumbnail:' +
                'ffmpeg -i "/home/user/Downloads/3433344.webm" -vf thumbnail,scale=512:512:force_original_aspect_ratio=decrease,boxblur=2:1 -vframes 1 -c:v libwebp -f image2pipe -lossless 0 -q:v 25 -compression_level 6 -preset icon - | base64 | xclip -selection clipboard -i'
        },
        media: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    },
);

Thumbnail.belongsTo(Media, {
    as: 'Media',
    foreignKey: 'media',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

exports.Thumbnail = Thumbnail;
