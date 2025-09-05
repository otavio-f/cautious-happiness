const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const { masterDB } = require('./db/master.js');
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const prefix = '/api/v0';

app.use(`${prefix}/`, indexRouter);
app.use(`${prefix}/media`, usersRouter);
app.use(`${prefix}/tag`, usersRouter);
app.use(`${prefix}/user`, usersRouter);

// creates default root
masterDB.sync({force: true})
    .then(() => {
        app.emit("INIT_DONE");
    });

module.exports = app;
