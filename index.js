var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var game = require('./server.js');
server.listen(3000);

//route for public assets and npm scripts
app.use(express.static(__dirname + '/public'));
app.use('/scripts', express.static(__dirname + '/node_modules'));


// socket.on(EVENT ID, FUNCTION)

io.on('connection', function (socket) {
    game.initGame(io, socket);
    
    console.log("server: " + socket.id + " connected");

    socket.on('disconnect', function () {
        console.log('user disconnected');
    });

});