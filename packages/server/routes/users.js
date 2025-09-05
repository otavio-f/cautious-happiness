'use strict';

const express = require('express');
const { UserController } = require('../controllers/UserController.js');
const { SessionManager } = require("../services/SessionManagement.js");

const router = express.Router();
const controller = new UserController();


router.get('/', function(req, res, next) {
    if(req.headers.authorization === undefined) // maybe redirect to login page instead
        return res.status(401).send(JSON.stringify({reason: 'No token!'}));

    const token = req.headers.authorization.split(' ')[1];
    if(token === undefined)
        return res.status(401).send(JSON.stringify({reason: 'Invalid token!'}));

    const userInfo = SessionManager.validateToken(token);
    if(userInfo === undefined)
        return res.status(403).send(JSON.stringify({reason: 'Forbidden'}));

    return res.send(JSON.stringify(userInfo));
    // FIXME: Flatten userInfo to string/int values, as values coming from DB are bugging
});


router.post('/login', async function(req, res, next){
    const data = req.body;
    if(data.username === undefined || data.password === undefined)
        return res.status(400).send(JSON.stringify({reason: 'Missing user credentials!'}));
    // TODO: Encrypt credentials with public key, decrypt here with private key
    return SessionManager.login(data.username, data.password, 3600)
        .then(result => {
            if(result === null)
                return res.status(403).send(JSON.stringify({reason: 'Wrong login credentials!'}));
            return res.status(200).send(JSON.stringify({token: result}));
        });
});


router.post('/create', async function(req, res, next){
    const data = req.body;
    if(data.username === undefined || data.password === undefined)
        return res.status(400).send(JSON.stringify({reason: 'Missing user credentials!'}));
    // TODO: Encrypt credentials with public key, decrypt here with private key
    return controller.create(data.username, data.password)
        .then(user => {
            return res.status(201).send(JSON.stringify({result: user.username}));
        });
});

module.exports = router;
