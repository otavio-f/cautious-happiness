'use strict';

process.env.NODE_ENV = 'dev';

const { expect } = require('chai');
const request = require('supertest');
const app = require('../../app.js');
const { UserController } = require("../../controllers/UserController");
const { SessionManager } = require("../../services/SessionManagement.js");
const { User } = require('../../models/user.js');


describe('/api/v0/user endpoint', function() {

    before("Wait for app to finish initializing", async () => {
        await new Promise(resolve => {
            app.once("INIT_DONE", resolve);
        });
    });

    beforeEach('reset user db', async () => {
        await User.destroy({truncate: true});
    });

    afterEach('Resets logged users',  () => {
        SessionManager.shutdown();
    });

    it('Creates an user', async () => {
        const response = await request(app)
            .post('/api/v0/user/create')
            .set('Accept', 'application/json')
            .send({username: 'user', password: 'pass'});

        expect(response.status).equals(201);
        expect(response.body).deep.equals({ result: 'user' });
    });

    it('Log-in',  async () => {
        const controller = new UserController();
        await controller.create("test", "secret");
        const response = await request(app)
            .post('/api/v0/user/login')
            .set('Accept', 'application/json')
            .send({username: 'test', password: 'secret'});

        expect(response.status).equals(200);
        expect(response.body.token).to.match(/^[0-9a-f]{32}$/);
    });

    it('Visits users home as logged user',  async () => {
        const controller = new UserController();
        await controller.create("test", "secret");
        const token = await SessionManager.login("test", "secret");

        const response = await request(app)
            .get('/api/v0/user/')
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).equals(200);
        expect(response.body).deep.equals({username: 'test', level: 10});
    });

    it('Error when visiting users home with wrong token type',  async () => {
        const controller = new UserController();
        await controller.create("test", "secret");
        const token = await SessionManager.login("test", "secret");

        const response = await request(app)
            .get('/api/v0/user/')
            .set('Accept', 'application/json')
            .set('Authorization', `Auth ${token}`);

        expect(response.status).equals(401);
        expect(response.body).deep.equals({reason: 'Invalid token!'});
    });

    it('Error when visiting users home without a token',  async () => {
        const controller = new UserController();
        await controller.create("test", "secret");
        const token = await SessionManager.login("test", "secret");

        const response = await request(app)
            .get('/api/v0/user/')
            .set('Accept', 'application/json');

        expect(response.status).equals(401);
        expect(response.body).deep.equals({reason: 'No token!'});
    });

    it('Error when visiting users home without being logged',  async () => {
        // NO USERS
        const token = "baddeadbeeffaceddeafcafefaddecaf";
        const response = await request(app)
            .get('/api/v0/user/')
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).equals(403);
        expect(response.body).deep.equals({reason: 'User is not logged in!'});
    });
})
