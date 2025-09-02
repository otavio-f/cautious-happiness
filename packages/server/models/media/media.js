'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../../db/master.js');
const { Tag } = require('../tag.js');
const { User } = require('../user.js');


const Media = masterDB.define('Media', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    uuid: {
        type: DataTypes.BLOB,
        allowNull: false,
        unique: true,
        validate: {
            isUUID(value) {
                if(!Buffer.isBuffer(value))
                    throw new Error("Media DB: Value must be a buffer!");
                if(value.byteLength !== 16)
                    throw new Error("Media DB: Incorrect sized uuid!");
            }
        }
    },
    sha256: {
        type: DataTypes.STRING(64), // hex digest
        allowNull: false,
        unique: true,
        validate: {
            is: /^[0-9a-f]{64}$/
        }
    },
    md5: {
        type: DataTypes.STRING(32), // hex digest
        allowNull: false,
        unique: true,
        validate: {
            is: /^[0-9a-f]{32}$/
        }
    },
    mediaType: {
        type: DataTypes.STRING(32), // first part of mime
        allowNull: false,
    },
    fileType: {
        type: DataTypes.STRING(128), // second part of mime
        allowNull: false
    },
    dateAdded: {
        type: DataTypes.INTEGER, // time inserted, epoch time in milliseconds
        allowNull: false,
    }
});

Media.belongsTo(User, {
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
    foreignKey: {
        name: 'owner',
        allowNull: false
    },
});

const MediaTags = masterDB.define('MediaTags',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
    },
    {
        indexes: [
            { unique: true, fields: ['tag', 'media'] }
        ]
    }
);

Media.belongsToMany(Tag, {
    through: MediaTags,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    foreignKey: {
        name: 'tag',
        allowNull: false
    },
});

Tag.belongsToMany(Media, {
    through: MediaTags,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    foreignKey: {
        name: 'media',
        allowNull: false
    },
});

exports.Media = Media;