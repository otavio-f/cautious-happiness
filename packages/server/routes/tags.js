'use strict';

const express = require('express');
const {userauth} = require("../middleware/userauth.js");
const {TagController} = require("../controllers/TagController");

const router = express.Router();
const controller = TagController;

// this route needs authentication
router.use(userauth);

/* Create - post */
router.post('/', async (req, res) => {
  const data = req.body;
  if(data.tag === undefined)
    return req.status(400).json({reason: "Missing tag parameter"});

  const tag = TagController.addTag(data.tag);
});

/* Search - post */
router.post('/search', async (req, res) => {

});

/* Update - put */
router.put('/', async (req, res) => {

});

/* Delete - delete */
router.delete('/', async (req, res) => {

});

/* Tags home - search for a tag */
router.get('/', async (req, res) => {

});
