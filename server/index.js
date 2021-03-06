const express = require('express')
const cors = require('cors')
const app = express();
const socketIO = require('socket.io');
const path = require('path')
require('./db/mongoose')
const userRouter = require('./routers/user')
const generateMessage = require('./utils/utils')

const PORT = process.env.PORT || 5000

const server = express()
  .use(app)
  .listen(PORT, () => console.log(`Listening Socket on ${ PORT }`));

const io = socketIO(server)


app.use(express.json())
app.use(cors())
app.use('/users',userRouter)

if(process.env.NODE_ENV === 'production'){
    app.use(express.static('client/build'))

    app.get('*', (req,res)=>{
        res.sendFile(path.join(__dirname, '../client', 'build', 'index.html'))
    })
}

let users={}
let players = {}
let unmatched = ""

function joinGame (socket,username) {
    players[socket.id] = {
        username:username,
        opponent: unmatched,
        symbol: 'X',
        socket: socket
    };
    if (unmatched.length>0) {
    players[socket.id].symbol = 'O';
    players[unmatched].opponent = socket.id;
    unmatched = null;
    } else {
    unmatched = socket.id;
    }
}
   
function getOpponent (socket) {
    if (!players[socket.id].opponent) {
    return;
    }
    return players[players[socket.id].opponent].socket;
}

io.on('connection', function (socket) {
    socket.on('roomData', (data) => {
        if(!users[data.room]||users[data.room].length===0){
            users[data.room]=[socket.id]
            socket.join(data.room)
            socket.emit("message",generateMessage("Admin",`Welcome ${data.username}!`))
        }else if(users[data.room].length===1){
            users[data.room].push(socket.id)
            socket.join(data.room)
            socket.emit("message",generateMessage("Admin",`welcome ${data.username}`))
            socket.broadcast.to(data.room).emit("message",generateMessage("Admin",`${data.username} has joined!`))
            socket.broadcast.to(data.room).emit('createOffer')
        }else{
            console.log("error")
        }
    });
    socket.on('final', function (data) {
        if(users[data][0]===socket.id){
         socket.broadcast.to(data).emit('createOffer');
        }
    });
    socket.on('make-offer', function (data) {
        socket.broadcast.to(data.room).emit('offer-made', {
            offer: data.offer,
            username:data.username
        });
    });
    socket.on('make-answer', function (data) {
        socket.broadcast.to(data.room).emit('answer-made', {
            answer: data.answer
        });
    });
    socket.on("incmessage",(data)=>{
        io.to(data.room).emit("message",generateMessage(data.username,data.message))
    })
    socket.on("gameData",(data)=>{
        if(data.restart){
            delete players[socket.id]
        }
        joinGame(socket,data.username)
        if (getOpponent(socket)) {
        socket.emit('game-begin', {symbol: players[socket.id].symbol,opponentUsername:players[getOpponent(socket).id].username});
        getOpponent(socket).emit('game-begin', {
        symbol: players[getOpponent(socket).id].symbol,
        opponentUsername:data.username
        });
        }
    })
    socket.on('make-move', function (data) {
        if (!getOpponent(socket)) {
        return;
        }
        socket.emit('move-made', data);
        getOpponent(socket).emit('move-made', data);
    });
    socket.on('disconnect', () => {
        let keys = Object.keys(users)
        keys.forEach(key => {
            let us = users[key].filter(id=> id !== socket.id)
            if(users[key]!==us){
                users[key] = [...us]
                if(users[key].length===0){
                    delete users[key]
                }else{
                    io.to(users[key]).emit("message",generateMessage("Admin","Your friend has left!"))
                }
            }
        });
        delete players[socket.id]
    })

});

