'use strict';

const { expect } = require('chai');
const { hashPassword } = require('../../utils/utils.js');
const { SessionManager } = require('../../services/SessionManagement.js');
const { masterDB } = require("../../db/master");
const { User } = require("../../models/user");

describe("Session Management", function() {
    let user;

    beforeEach(async function() {
        await masterDB.sync({force: true});
        const secret = hashPassword("0000.0000");
        user = await User.create({
            username: "test",
            password: secret.hash,
            salt: secret.salt,
            level: 5
        });
    });

    this.timeout(5000);
    it('Logs an user', async function () {
        const result = await SessionManager.login("test", "0000.0000");

        expect(result).to.not.null;
    });

    it('Login fails if username does not exist', async function () {
        const result = await SessionManager.login("I shouldn't exist", "0000.0000");

        expect(result).to.be.null;
    });

    it('Login fails if password does not match', async function () {
        const result = await SessionManager.login("test", "ThisIsWrong");

        expect(result).to.be.null;
    });

    it('Validates token', async function () {
        const token = await SessionManager.login("test", "0000.0000");

        const validated = SessionManager.validateToken(token);

        expect(validated.token).to.equal(token);
    });

    it('Fails to validate invalid token', function () {
        const token = "I'm not a valid token at all!";

        const isTokenValid = SessionManager.validateToken(token);

        expect(isTokenValid).to.be.undefined;
    });

    it('Logs out an user', async function () {
        const token = await SessionManager.login("test", "0000.0000");

        SessionManager.logout(token);
        const isTokenValid = SessionManager.validateToken(token);

        expect(isTokenValid).to.be.undefined;
    });

    it('Logouts automatically on timeout', async function () {
        const token = await SessionManager.login("test", "0000.0000", 1);

        await new Promise(resolve => setTimeout(resolve, 1500)); // enough time to expire
        const isTokenValid = SessionManager.validateToken(token);
        expect(isTokenValid).to.be.undefined;
    });

    it('Does not logout automatically before timeout', async function () {
        const token = await SessionManager.login("test", "0000.0000", 1);

        await new Promise(resolve => setTimeout(resolve, 900)); // not enough time to expire
        const isTokenValid = SessionManager.validateToken(token);
        expect(isTokenValid).to.not.be.undefined;
    });

    it('Refreshes token', async function () {
        const token = await SessionManager.login("test", "0000.0000", 1); // token should be valid for a second

        const refreshSuccess = SessionManager.refresh(token, 3600); // sets new timeout to an hour
        await new Promise(resolve => setTimeout(resolve, 2 * 1000)); // makes sure token is expired if refresh didn't work

        const isTokenValid = SessionManager.validateToken(token);
        expect(refreshSuccess).to.be.true;
        expect(isTokenValid).to.not.be.undefined; // token should still be valid
    });

    it('Fails to refresh expired token', async function () {
        const token = await SessionManager.login("test", "0000.0000", 2); // token should be valid for a second

        await new Promise(resolve => setTimeout(resolve, 3 * 1000)); // sets new timeout to an hour
        const refreshSuccess = SessionManager.refresh(token, 3600); // sets new timeout to an hour

        const isTokenValid = SessionManager.validateToken(token);
        expect(refreshSuccess).to.be.false;
        expect(isTokenValid).to.be.undefined; // token should still be valid
    });

    it('Fails to refresh invalid token',  function () {
        const refreshSuccess = SessionManager.refresh("I'm not a valid token", 3600); // sets new timeout to an hour
        expect(refreshSuccess).to.be.false;
    });
});