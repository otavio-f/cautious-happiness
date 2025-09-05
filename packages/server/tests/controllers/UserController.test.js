'use strict';

process.env.NODE_ENV = 'dev';

const { expect} = require('chai');
const { hashPassword, genRandom } = require('../../utils/utils.js');
const { UserController } = require('../../controllers/UserController.js');
const { masterDB } = require('../../db/master.js');
const { User, UserPrivilegeLevels } = require('../../models/user.js');


describe('User Controller', function() {
    let admin;

    beforeEach(async function() {
        await masterDB.sync({force: true});
        const secret = await hashPassword("0000.0000");
        await User.create({
            username: "test",
            password: secret.hash,
            salt: secret.salt,
            level: 5
        });

        admin = await User.create({
            username: "root",
            password: secret.hash,
            salt: secret.salt,
            level: 0
        });
    });

    it('Creates an user', async function() {
        const control = new UserController();

        await control.create("new_user", "********", admin);
        const result = await User.findOne({
            where: {username: "new_user"}
        });

        expect(result).to.not.be.null;
        expect(result.username).to.equal("new_user");
        expect(result.level).to.equal(admin.level+1);
    });

    it('Creates an unprivileged user', async function() {
        const control = new UserController();

        await control.create("new_user", "********");
        const result = await User.findOne({
            where: {username: "new_user"}
        });

        expect(result).to.not.be.null;
        expect(result.username).to.equal("new_user");
        expect(result.level).to.equal(UserPrivilegeLevels.lowest);
    });

    it('Fails to create an user when the creator has no such privileges', async function() {
        const control = new UserController();
        const secret = await hashPassword("0000.0000");
        const commonUser = await User.create({
            username: "unprivileged",
            password: secret.hash,
            salt: secret.salt,
            level: UserPrivilegeLevels.lowest
        });

        return control.create("new_user", "********", commonUser)
            .then(() => {
                throw new Error("Expected an exception but none was thrown.")
            })
            .catch(reason => expect(reason.message).to.equal("User Controller: User privilege level doesn't allow to create other users."));
    });

    it('Fails to create an user with equal privileges than the creator', async function() {
        const control = new UserController();

        return control.create("new_user", "********", admin, 0) // user "root" has level 5
            .then(() => {
                throw new Error("Expected an exception but none was thrown.")
            })
            .catch(reason => expect(reason.message).to.equal("User Controller: Cannot create user with lower or equal privilege level."));
    });

    it('Fails to create an user with more privileges than the creator', async function() {
        const control = new UserController();
        const test = await User.findOne({where: {username: "test"}});

        return control.create("new_user", "********", test, 0) // user "test" has level 5
            .then(() => {
                throw new Error("Expected an exception but none was thrown.")
            })
            .catch(reason => expect(reason.message).to.equal("User Controller: Cannot create user with lower or equal privilege level."));
    });

    it('Fails to create an user with invalid privilege level', async function() {
        const control = new UserController();

        return control.create("new_user", "********", admin, 20)
            .then(() => {
                throw new Error("Expected an exception but none was thrown.")
            })
            .catch(reason => expect(reason.message).to.equal("User Controller: Invalid privilege level 20."));
    });

    it('Changes password', async function() {
        const control = new UserController();
        const oldPassword = admin.password;

        await control.changePassword(admin, "********");
        const {hash: newPassword} = await hashPassword("********", admin.salt);
        expect(oldPassword).to.not.deep.equal(admin.password);
        expect(newPassword).to.deep.equal(admin.password);
    });
})