const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');
const db = require('./db');

const server = createServer();

server.express.use(cookieParser());

// Decode the JWT so we can get the user on each request
server.express.use((req, res, next) => {
    const { token } = req.cookies;
    if (token) {
        const { userId } = jwt.verify(token, process.env.APP_SECRET);
        // put the user id onto the request for further requests to access.
        req.userId = userId;
    }
    next();
})

// Create a middleware that populates the user on each request
server.express.use(async (req, res, next) => {
    // If they are not logged in then skip this
    if (!req.userId) return next();
    const user = await db.query.user(
        { where: { id: req.userId } },
        // This is telling the query which fields on the user that we want returned, when we don't have access to the info variable 
        '{ id, permissions, email, name }'
    );
    req.user = user;
    next();
})

server.start({
    cors: {
        credentials: true,
        origin: process.env.FRONTEND_URL,
    },

}, deets => {
    console.log(`Server is now running on port: http://localhost:${deets.port}`)
});