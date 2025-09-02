const express = require('express');
const router = express.Router();
const { UserController } = require('../controllers/UserController.js');


const controller = new UserController();


/* GET users listing. */
router.get('/', function(req, res, next) {
  res.status(200).send('Users dir OK');
});

router.get('/:userToken', function(req, res, next) {
  controller.validateToken((req.params.userToken))
      .then(user => {
        if(user === undefined)
          res.status(401).send(JSON.stringify({reason: 'Invalid token'}));
        else
          res.send(`Welcome ${user.username}!`);
      });
});

router.post('/login', function(req, res, next){

});

module.exports = router;
