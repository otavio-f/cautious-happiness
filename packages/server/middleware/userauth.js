const { UserController } = require('../controllers/UserController.js');
const { SessionManager } = require("../services/SessionManagement.js");

/**
 * User authentication middleware. Attaches the currently logged <code>user</code> to the <code>req</code> object as <code>req.user</code>.
 * Returns errors if the user is not authenticated.
 * @param {Request} req
 * @param {http.Response} res
 * @param {NextFunction} next
 */
const userauth = (req, res, next) => {
  const controller = new UserController();
  if(req.headers.authorization === undefined)
    return res.status(400).json({reason: 'No token!'});

  const token = /^Bearer ([0-9a-f]{32})$/.exec(req.headers.authorization);

  if(token === null)
    return res.status(400).json({reason: 'Invalid token!'});

  const userInfo = SessionManager.validateToken(token[1]);
  if(userInfo === undefined)
    return res.status(401).json({reason: 'User is not logged in!'});

  controller.getById(userInfo.id)
    .then(user => {
      req.user = user;
      next();
    })
    .catch(err => {
      next(err);
    });
}

module.exports = { userauth };
