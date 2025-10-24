'use strict';

const express = require('express');
const { UserController } = require('../controllers/UserController.js');
const { SessionManager } = require("../services/SessionManagement.js");
const { userauth } = require("../middleware/userauth.js");

const router = express.Router();
const controller = new UserController();

/* Users home page */
router.get('/', userauth, async function(req, res, next) {
    return res.status(200).json({username: req.user.username, level: req.user.level});
});

/* login page */
router.post('/login', async function(req, res, next){
    const data = req.body;
    if(data.username === undefined || data.password === undefined)
        return res.status(400).json({reason: 'Missing user credentials!'});
    // TODO: Encrypt credentials with public key, decrypt here with private key
    return SessionManager.login(data.username, data.password, 3600)
        .then(result => {
            if(result === null)
                return res.status(403).json({reason: 'Wrong login credentials!'});
            return res.status(200).json({token: result});
        });
});

/* create user page */
router.post('/create', async function(req, res, next){
    const data = req.body;
    if(data.username === undefined || data.password === undefined)
        return res.status(400).json({reason: 'Missing user credentials!'});
    return controller.create(data.username, data.password)
        .then(user => {
            return res.status(201).json({result: user.username});
        });
});

module.exports = router;
