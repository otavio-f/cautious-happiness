'use strict';
const { hashPassword, genRandom } = require('../utils/utils.js');
const { User, UserPrivilegeLevels } = require('../models/user.js');

/**
 * Controller for user operations
 * @constructor
 */
const UserController = function ()  { }

/**
 * Creates a new user with a lower privilege level. By default creates an unprivileged user
 * @param {string} username New username
 * @param {string} password Password
 * @param {User} [creator] The user token, if ignored, will create an unprivileged common user.
 * @param {number} [level] User level privilege. If ommited, creates a new user one privilege level higher than the token user. Ignored when trying to create an unprivileged user
 * @throws {Error} if the creator user has a privilege level of 10.
 * @throws {Error} if the level is lower than the creator user privilege level.
 * @returns {Promise<User>} the new User created
 */
UserController.prototype.create = async (username, password, creator, level) => {
    let newLevel = UserPrivilegeLevels.lowest;
    if(creator !== undefined) {
        if(creator.level >= UserPrivilegeLevels.lowest)
            throw new Error("User Controller: User privilege level doesn't allow to create other users.");

        newLevel = level ?? (creator.level + 1);
        if(newLevel <= creator.level)
            throw new Error("User Controller: Cannot create user with lower or equal privilege level.");
        if(newLevel > UserPrivilegeLevels.lowest)
            throw new Error(`User Controller: Invalid privilege level ${newLevel}.`);
    }

    // TODO: Password validation
    const {hash, salt} = hashPassword(password);
    return User.create({username, password: hash, salt, level: newLevel});
}

/**
 * Changes password
 * The user will be logged out
 * @param {User} user
 * @param {string} newPassword
 */
UserController.prototype.changePassword = async (user, newPassword) => {
    const {hash, salt} = hashPassword(newPassword);
    user.password = hash;
    user.salt = salt;

    await user.save();
}

/**
 * Finds user by id
 * @param {number} id
 * @return {Promise<User|null>}
 */
UserController.prototype.getById = (id) => {
    return User.findOne({
        where: {id}
    });
}

/**
 * Gets user by username
 * @param {string} username
 * @return {Promise<User|null>}
 */
UserController.prototype.getByUsername = (username) => {
    return User.findOne({
        where: {username}
    });
}

exports.UserController = UserController;
