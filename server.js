/* 
 * You're a lunatic tyrant who's taken control.
 * Purge the world.
 */
var io; //socket.io library
var socket; //socket object for connected client
var games = []; //array of all current games

exports.initGame = function (sio, gameSocket) {
    io = sio;
    socket = gameSocket;

    //misc events
    socket.on('listGames', listGames);

    //host events
    socket.on('hostCreateGame', hostCreateGame);
    socket.on('hostStartGame', hostStartGame);
    socket.on('hostAdvancePhase', hostAdvancePhase);

    //player events
    socket.on('playerJoinGame', playerJoinGame);
    socket.on('playerTargetAction', playerTargetAction);
};
//EVENT EMITTERS AND LISTENERS IN A NUTSHELL
//io emit events (senders) are ('eventlabel', {data})
//io on events (recievers) are ('eventlabel', (function to run));
//function then runs as function({data});

//MISC FUNCTIONS

function listGames(emit = true) {
    var list = games.map(game => game.id);
    if (emit) {
        this.emit('listGames', list);
    }
    return list;
}

function getGame(gameID) {
    for (var i = 0, len = games.length; i < len; i++) {
        if (games[i].id === gameID) {
            return games[i];
        }
    }
    console.log("getGame: " + gameID + " not found");
    return false;
}

function getClientGame(socketID) {
    for (var i = 0, len = games.length; i < len; i++) {
        //if (games[i].hostID === socketID) {
        if (games[i].listSockets().indexOf(socketID) > -1) {
            return games[i];
        }
    }
    console.log("getClientGame: game not found for " + socketID);
    return false;
}

//HOST FUNCTIONS
//"this" is the socket executing the function
function hostCreateGame() {
    console.log('server: host create game');
    var newgame = new game(this.id);
    this.join(newgame.id);
    this.emit('newGameCreated', {gameID: newgame.id});
}

function hostStartGame() {
    //var game = getGame(data.gameID);
    var game = getClientGame(this.id);
    if (game) {
        var log = game.start(this.id);
        this.emit('log', {msg: log});
    }
}
function hostAdvancePhase() {
    var game = getClientGame(this.id);
    if (game) {
        var log = game.advancePhase();
        this.emit('log', {msg: log});
    }
}

//PLAYER FUNCTIONS

function playerJoinGame(data) {
//data should contain data.playerName and data.gameID
    var game = getGame(data.gameID);
    if (game) {
        if (game.addPlayer(data.playerName, this.id)) {
            //todo send game state publicly and player state privately
            var response = {gameID: game.id, socketID: this.id, name: data.playerName, players: game.listPlayers()};
            this.join(game.id, function () {
                io.sockets.in(game.id).emit('playerJoined', response);
            });
        } else {
            this.emit('alert', {msg: "could not join: game is full or already started"});
        }
    } else {
        this.emit('alert', {msg: "Invalid Game ID"});
    }
}

function playerTargetAction(data) {
    //data should contain socketID (of target), public (bool), action (ex. "vote")
    //todo correlate type to player's available actions
    //todo split into separate action and voting functions?
    var game = getClientGame(this.id);
    if (game) {
        player = game.getPlayer(this.id);
        target = game.getPlayer(data.socketID);
        //have you already voted?
        if (!player.hasVoted() && player.alive) {
            if (data.public) {
                player.hasVotedFor = target.name;
                target.currentVotes.push(player.name);
            } else {
                player.hasVotedFor = "anonymous";
                target.currentVotes.push("anonymous");
            }
            //need to figure out how to put night kills on the stack
            //todo these probably should't go here but it will work and I haven't tested my code in three hours
            game.sendGameState();
        }
    }
}

//GAME LOGIC

var player = class {
    constructor(name, socketID) {
        this.name = name;
        this.socketID = socketID;
        this.role = null;
        this.team = "";
        this.alive = true;
        this.currentVotes = []; //keep an array of the players who voted for you
        this.hasVotedFor = null; //maybe turn this into the player you voted for
        this.currentGameID = null;
    }

    getPlayerState() {
        var data = {
            name: this.name,
            socketID: this.socketID,
            team: this.team,
            alive: this.alive,
            currentVotes: this.currentVotes,
            hasVotedFor: this.hasVotedFor
        };
        return data;
    }

    hasVoted() {
        if (this.hasVotedFor) {
            return true;
        } else {
            return false;
        }
    }

    resetVotes() {
        this.currentVotes = [];
        this.hasVotedFor = null;
    }

    kill() {
        this.alive = false;
        console.log(this.socketID + ": " + this.name + " was murdered.");
    }

}

var game = class {
    constructor(hostID = null, mode = "werewolf") {
        this.id = makeID();
        this.mode = mode;
        //collects player objects
        this.players = [];
        this.hostID = hostID;

        //loads available teams and roles to pass out?
        //idk how this should workthis.phases = [];
        this.phases = [];
        //teams = [majority, minority, solo, solo, solo...]
        this.teams = [];
        this.roles = [];

        //keeps track of current game state
        this.currentRound = 0;
        this.currentPhase = "";
        this.livingRebels = 0;
        this.message = "";
        this.setModeParameters(mode);
        games.push(this);
    }

    setModeParameters(mode) {
        switch (mode) {
            case "werewolf":
                this.phases = ["night", "day"];
                this.teams = ["imperal", "rebel"];
                this.roles = ["rebel", "inquisitor", "doctor", "plebian"];
                break;
            default:
                break;
        }
    }

    resetPlayerVotes() {
        for (var i = 0, len = this.players.length; i < len; i++) {
            this.players[i].resetVotes();
        }
    }

    tallyVotes() {
        //phase will determine if this is a public vote or a private (rebel) vote
        //todo change phase parameters to come from a class or something
        //todo probably rewrite so tally votes is seperate from executing the traitor
        switch (this.currentPhase) {
            case "day":
                var publicVote = true;
                break;
            case "night":
                var publicVote = false;
                var restrictTeam = "rebel";
            default:
                var publicVote = true;
        }
        var participatingPlayers = [];
        var selectedPlayers = [];
        var voted = 0;
        //see if we're waiting on votes

        for (var i = 0, len = this.players.length; i < len; i++) {
            var player = this.players[i];
            if (restrictTeam) {
                if (player.alive && player.team === restrictTeam) {
                    if (player.hasVoted()) {
                        voted++;
                    }
                    participatingPlayers.push(player);
                }
            } else {
                if (player.alive) {
                    if (player.hasVoted()) {
                        voted++;
                    }
                    participatingPlayers.push(player);
                }
            }
        }

        var total = participatingPlayers.length;
        var goal = Math.ceil(participatingPlayers.length / 2);

        //shove anyone who meets the goal into an array
        //since a majority is required, the maximum number of elements is 2, which signals a tie 
        for (var i = 0, len = participatingPlayers.length; i < len; i++) {
            if (participatingPlayers[i].currentVotes.length >= goal) {
                selectedPlayers.push(participatingPlayers[i]);
            }
        }

        //is that your final answer? check if everyone voted, or if there's already been a decision.
        if (total - voted === 0 || selectedPlayers.length > 0) {
            if (selectedPlayers.length === 1) {
                selectedPlayers[0].kill();
                if (publicVote) {
                    this.sendGameState();
                }
            } else {
                console.log(this.id + ": vote failed");
            }
        }
        console.log("total: " + total);
        console.log("voted: " + voted);
        return (total - voted);
    }

    //shifts first element in phase array and sets that to be current phase
    //if the phases run out, then phases are reset with setModeParameters() and round number increments
    //sends updated game state to players
    advancePhase() {
        if (this.phases.length === 0) {
            this.setModeParameters(this.mode);
            this.resetPlayerVotes();
            this.currentRound++;
        }
        this.currentPhase = this.phases.shift();
        this.sendGameState();
        return "advancing to: round " + this.currentRound + " " + this.currentPhase;
    }

    getGameState() {
        var data = {
            id: this.id,
            mode: this.mode,
            playerList: this.listPlayers(),
            round: this.currentRound,
            phase: this.currentPhase,
            message: this.message,
            livingRebels: this.livingRebels,
            remainingVotes: this.tallyVotes()
        };
        return data;
    }
    //is it a bad idea to do this inside the game object?
    sendGameState() {
        io.sockets.in(this.id).emit('updateGameState', this.getGameState());
    }

    //creates a list of all connected sockets for game-getting without clients having to specify the game ID
    listSockets() {
        var list = this.players.map(player => player.socketID);
        list.push(this.hostID);
        return list;
    }

    listPlayers() {
        var playerList = [];
        for (var i = 0, len = this.players.length; i < len; i++) {
            playerList.push(this.players[i].getPlayerState());
        }
        return playerList;
    }

    addPlayer(playerName, socketID) {
        //todo check for duplicates
        if (this.currentRound === 0) {
            var i = (this.players.push(new player(playerName, socketID)) - 1);
            this.players[i].currentGameID = this.id;
            console.log(socketID + " joined " + this.players[i].currentGameID + " as " + playerName);
            return this.id;
        }
    }

    getPlayer(socketID) {
        for (var i = 0, len = this.players.length; i < len; i++) {
            if (this.players[i].socketID === socketID) {
                //console.log("located " + this.players[i].socketID);
                return this.players[i];
            }
        }
        return false;
    }

    start() {
        if (this.currentRound === 0) {
            if (this.registerTeams()) {
                this.currentRound = 1;
                this.message = "game has started";
                this.updateLivingRebels();
                this.advancePhase();
                return "starting game with " + this.players.length + " players";
            } else {
                return "not enough players";
            }
        } else {
            return "game has already started";
        }
    }

    //team 0 is imperials, team 1 is rebels
    //this randomly assigns 1/3 of players to the rebel team
    registerTeams() {
        //todo use array.shift to do this dynamically later
        var majority = this.teams[0];
        var minority = this.teams[1];
        //game can't start without a bare minimum of 3 players
        if (this.players.length < 3) {
            return false;
        }
        var assignmentArray = [];
        for (var i = 0; i < this.players.length; i++) {
            //set everyone to majority team first
            this.players[i].team = majority;
            assignmentArray.push(i);
        }
        //2 to 1, round down, minimum 1
        var rebels = Math.floor(assignmentArray.length / 3);
        shuffle(assignmentArray);

        for (var i = 0; i < rebels; i++) {
            this.players[assignmentArray[i]].team = minority;
        }
        return true;
    }

    kill(playerID) {
        this.players[playerID].kill();
    }

    updateLivingRebels() {
        var rebels = 0;
        for (var i = 0; i < this.players.length; i++) {
            if (this.players[i].alive && this.players[i].team === this.teams[1]) {
                rebels++;
            }
        }
        this.livingRebels = rebels;
        return rebels;
    }

    checkWinCon() {
        return false;
    }

}

function roll(die = 1, faces = 6) {
    die = parseInt(die);
    faces = parseInt(faces);
    var result = 0;
    for (var i = 0; i < die; i++) {
        result += Math.ceil((Math.random() * (faces)));
    }
    return result;
}

function makeID() {
    var roomID = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
    for (var i = 0; i < 4; i++) {
        roomID += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    if (listGames(false).indexOf(roomID) === -1) {
        return roomID;
    } else {
        console.log("duplicate ID found, regenerating...");
        makeID();
    }
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}


//TODO LIST
//allow rejoining a game in progress if you were disconnected?
//save sessions as cookies so a reload won't kill you?
//at the same time also remove people on proper disconnects?
//destroy old rooms if nobody is in them anymore

//check win con
//render death screen for dead players
//set up "available actions" array for players to programatically determine what they can do in a given phase
//add phase timer
//programatically advance phase if phase timer runs down or all actions are entered