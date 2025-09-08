'use strict';

const express = require('express');
const {SessionManager} = require("../services/SessionManagement.js");
const router = express.Router();


/* Tags home */
router.get('/', async (req, res) => {
    if(req.headers.authorization === undefined) // maybe redirect to login page instead
        return res.status(401).json({reason: 'No token!'});

    const token = /^Bearer ([0-9a-f]{32})$/.exec(req.headers.authorization);

    if(token === null)
        return res.status(401).json({reason: 'Invalid token!'});

    const userInfo = SessionManager.validateToken(token[1]);

});
