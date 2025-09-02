'use strict';

const crypto = require('crypto');

/**
 * @typedef {{hash: Buffer, salt: Buffer}} PasswordHash
 */

/**
 * Hashes a password
 * @param {string} password the password, latin1 encoded
 * @param {Buffer} [salt] The password salt, if not supplied a new random salt will be created
 * @returns {PasswordHash}
 */
exports.hashPassword = (password, salt) => {
    const binPw = Buffer.from(password, 'latin1');
    const useSalt = salt??crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(binPw, useSalt, 65536, 64, 'sha512');

    return {hash, salt: useSalt};
}

/**
 * Generates a random string or byte array
 * @param {'uuid'|'string'|'bin'} method if 'uuid', generates an uuidV4 without the dashes, if 'string' generates a string of length, if 'bin' generates a Buffer
 * @param {number} [length=32] Length of data if using 'string' or 'bin' methods. Ignored if using 'uuid' method
 * @returns {string|Buffer} A string or a buffer if using 'bin' method
 */
exports.genRandom = (method, length) => {
    if(method === 'uuid')
        return crypto.randomUUID().replace(/-/g, '');
    if(method === 'string')
        return crypto.randomBytes(length??32).toString('latin1');
    if(method === 'bin')
        return crypto.randomBytes(length??32);
    throw new Error('Utils: Unsupported method for genRandom!');
}
