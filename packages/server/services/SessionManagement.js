'use strict';

const { User } = require("../models/user.js");
const { hashPassword, genRandom } = require('../utils/utils.js');

const SessionManager = function() {
    /**
     * @typedef {{id: number, token: string, timeout: number}} UserToken
     */

    /** @type UserToken[] **/
    this.tokens = [];
}

/**
 * Performs login of a user
 * @param {string} username
 * @param {string} password
 * @param {number} [revokeTime=3600] Time in seconds to revoke the generated token, an hour (3600s) by default.
 * @returns {Promise<string|null>} The user token, or null if the login info was invalid
 */
SessionManager.prototype.login = async function(username, password, revokeTime){
    const user = await User.findOne({
        where: {username}
    });

    if(user === null) // no user with name
        return null;

    const {hash} = hashPassword(password, user.salt);
    if(hash.compare(user.password) !== 0) // incorrect password
        return null;

    const token = genRandom('uuid');
    // remove the token after timeout
    const timeout = setTimeout(() => this.logout(token), revokeTime * 1000);
    this.tokens.push({id: user.id, token, timeout});
    return token;
}

/**
 * Performs logout of a user by its token
 * @param {string} token
 * @returns {boolean} True if the user was logged out, otherwise false
 */
SessionManager.prototype.logout = function (token) {
    const toDelete = this.tokens.findIndex(user => user.token === token);
    if(toDelete !== -1) {
        this.tokens.splice(toDelete, 1);
        return true;
    }
    return false;
}

/**
 * Refreshes the timeout of an user
 * @param {string} token Token of the logged user
 * @param {number} revokeTime The timeout in seconds
 * @returns {boolean} True if the user token was refreshed successfully, otherwise false
 */
SessionManager.prototype.refresh = function (token, revokeTime) {
    const loggedUser = this.tokens.find(user => user.token === token);
    if(loggedUser) {
        clearTimeout(loggedUser.timeout);
        loggedUser.timeout = setTimeout(() => this.logout(token), revokeTime * 1000);
        return true;
    }
    return false;
}

/**
 * Checks if the token is valid.
 * @param {string} token
 * @returns {UserToken | undefined} Returns user token details if it is logged or undefined if the user is not logged.
 */
SessionManager.prototype.validateToken = function(token) {
    return this.tokens.find(user => user.token === token);
}

exports.SessionManager = SessionManager;