'use strict';

const { DataTypes} = require('sequelize');
const { masterDB } = require('../db/master.js');

/**
 * This file defines a user model.
 *
 * Users have a privilege level. The lower the level, the more privileges the user has.
 * A level zero user is the equivalent of a root, and a level ten is a common user with no special privileges.
 *
 * A common unprivileged user can be created at any time.
 * A user with any privilege level can only be created by a user that has more privileges.
 *
 * That means a level ten user (the lowest privilege level) cannot create any user,
 * any level from one to nine user has to be created by an user with one less privilege level,
 * and a level zero user (the highest privilege level) cannot be created by any user.
 */

const UserPrivilegeLevels = {
    lowest:  10,
    highest: 0
}

const User = masterDB.define('User',{
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    username: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true
    },
    password: { // TODO: Use pbkdf2, 65536 iterations, SHA512, salt is random 8 bytes
        type: DataTypes.BLOB, // 64 bytes
        allowNull: false,
        comment: 'The password hash.'
    },
    salt: {
        type: DataTypes.BLOB, // 16 bytes
        allowNull: false,
        comment: 'The password salt.'
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'The user level, from zero to ten. Lower level means more privileges.'
    }
});

module.exports = { UserPrivilegeLevels, User };
