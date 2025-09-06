'use strict';

const { expect } = require('chai');
const request = require('supertest');
const app = require('../../app.js');
const { UserController } = require("../../controllers/UserController");
const whyIsNodeRunning = require('why-is-node-running');


describe('/api/v0/user endpoint', function() {

    this.timeout(5000);

    beforeEach("Wait for app to initialize completely", async () => {
        await new Promise(resolve => {
            app.once("INIT_DONE", resolve);
        });
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
        expect(response.body.token).to.match(/^[0-9a-f]{32}$/g);
        setImmediate(() => whyIsNodeRunning());
    });
})
