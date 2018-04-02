//client.js
var IO = {
    //All code related to Socket.IO connections goes here.
    init: function () {
        console.log("client initialized");
        IO.socket = io.connect();
        IO.bindEvents();
    },
    //set up event listeners
    bindEvents: function () {
        IO.socket.on('connect', IO.onConnected);
        IO.socket.on('alert', Debug.notification);
        IO.socket.on('log', Debug.log);
        IO.socket.on('newGameCreated', IO.onNewGameCreated);
        IO.socket.on('listGames', IO.listGames);
        IO.socket.on('playerJoined', IO.playerJoined);
        IO.socket.on('updateGameState', IO.updateGameState);
        //IO.socket.on('gameStarted', IO.gameStarted);
        //IO.socket.on('gameOver', IO.gameOver);
        //IO.socket.on('error', IO.error);
    },
    onConnected: function () {
        App.mySocketID = this.id;
        Render.mySocketID = App.mySocketID;
        //console.log(App.mySocketID);
    },
    listGames: function (data) {
        console.log(data);
    },
    onNewGameCreated: function (data) {
        console.log(data);
        App.gameID = data.gameID;
        App.isHost = true;

        Render.state = "host";
        Render.message = "waiting for players";
        Render.gameID = App.gameID;
    },
    playerJoined: function (data) {
        console.log(data.name + " joined");
        console.log(data);
        Render.playerList = data.players;
        //update local variables if you're the new player
        //if I want to make this more secure later I'll just emit to the player directly
        //console.log("if " + this.id + " = " + data.socketID);
        if (data.socketID === App.mySocketID) {
            App.gameID = data.gameID;
            App.isHost = false;

            Render.state = "player";
            Render.message = "waiting for game start";
            Render.gameID = App.gameID;
            Render.myName = data.name;
        }
    },
    updateGameState: function (data) {
        //stuff we need to keep track of is:
            //action: waiting/submitted
            //round timer?
            
            Render.gameID = data.id;
            Render.message = data.message;
            Render.playerList = data.playerList;
            Render.round = data.round;
            Render.phase = data.phase;
            Render.livingRebels = data.livingRebels;
            Render.remainingVotes = data.remainingVotes;
    }
//game progresses to next phase when all player actions are submitted   
};
var App = {
    //generic game logic
    gameID: 0,
    isHost: false,
    mySocketID: '',
    init: function () {
        //console.log("binding events");
        // Host
        //$("#hostGame").click(App.Host.onHost);
        //$("#startGame").click(App.Host.onStart);

        // Player
        //$("#joinGame").click(App.Player.onJoin);

    },
    Host: {
        //game logic for host screens
        onHost() {
            console.log('attemtping to host new game');
            IO.socket.emit('hostCreateGame');
        },
        onStart() {
            console.log('attempting to start game');
            IO.socket.emit('hostStartGame');
        },
        onAdvancePhase() {
            console.log('attempting to advance phase');
            IO.socket.emit('hostAdvancePhase');
        }
    },
    Player: {
        //game logic specific to player screens
        onJoin() {
            var room = $("#gameID").val();
            var name = $("#playerName").val();
            console.log('attemtping to join ' + room + ' as ' + name);
            IO.socket.emit('playerJoinGame', {gameID: room, playerName: name});
        },
        onTarget(targetID) {
            //for now let's say all actions at night are private to make this simple
//            var public = true;
//            if (Render.phase === "night") {
//                public = false;
//            }
            console.log('attemtping to target ' + targetID);
            IO.socket.emit('playerTargetAction', {socketID: targetID, public: true, action: "vote"});
        }
    }
};

var Render = new Vue({
    el: '#main',
    data: {
        debug: true,
        state: "new",
        gameID: "",
        message: "",
        myName: "",
        mySocketID: "",
        playerList: [],
        round: 0,
        phase: "",
        livingRebels: 0,
        remainingVotes: 0,
        aliveButton: 'btn-primary',
        deadButton: 'btn-muted disabled',
        gameList: {}
    }
});

var Debug = {
    logging: true,
    useRandomNames: true,
    log: function (data) {
        if (this.logging) {
            console.log(data);
        }
    },
    notification: function (data) {
        alert(data.msg);
    },

    nameList: ["Katarina", "Uriel", "Connor", "Theodora", "Koala", "Elliana", "Nicky", "Denny", "Humanshield", "Ewreck", "Minkie", "Derothaan", "Master Yi", "Sam", "Panda", "Nova", "Teemo", "Morgana", "Kerrigan", "Murky", "Mark", "Akali"],
    genRandomName: function (nameList = this.nameList) {
        index = Math.floor(Math.random() * nameList.length);
        return nameList.splice(index, 1)[0];
    }
};

$(document).ready(function () {
    IO.init();
    App.init();

    if (Debug.useRandomNames) {
        $("#playerName").val(Debug.genRandomName());
    }
});