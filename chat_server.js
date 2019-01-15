// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	Room = require("./room.js"),
	fs = require("fs");

var username = {};
var roomname = [];
var roomList = [];


// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function (req, resp) {
	// This callback runs when a new connection is made to our HTTP server.

	fs.readFile("main.html", function (err, data) {
		// This callback runs when the client.html file has been read from the filesystem.

		if (err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(process.env.PORT || 5000);

// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function (socket) {
	// This callback runs when a new Socket.IO connection is established.

	socket.on('message_to_server', function (data) {
		// This callback runs when the server receives a new message from the client.
		console.log("message: " + data["message"] + " in " + socket.room); // log it to the Node.JS output
		io.sockets.in(socket.room).emit("message_to_client", { message: data["message"], usern: socket.username }) // broadcast the message to other users

	});

	socket.on('message_to_server_secret', function (data) {
		// This callback runs when the server receives a new message from the client.
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name == socket.room || roomList[i].name == socket.room + "/" || roomList[i].name + "/" == socket.room) {
				roomObject = roomList[i];
				break;
			}
		}
		if (roomObject.people.indexOf(data.receiver) != -1) {
			username[data.receiver].emit("secret_message_to_client", { message: data.message, usern: socket.username, receiver: data.receiver });
			username[socket.username].emit("secret_message_to_client", { message: data.message, usern: socket.username, receiver: data.receiver });
			console.log("secret!");
		} else {
			console.log("wrong user to secret");
			username[socket.username].emit("error_message_log", "Username not found in room");
		}
		// log it to the Node.JS output
		//io.sockets.in(socket.room).emit("message_to_client",{message:data["message"], usern: socket.username }) // broadcast the message to other users

	});

	socket.on("remove_user_from_room", function (data) {
		//check if user is in room and remove them from room
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name == socket.room) {
				roomObject = roomList[i];
				break;
			}
		}
		if (roomObject.people.indexOf(data) == -1) {
			username[socket.username].emit("error_remove_user", "User not found in chat room");
		} else {
			username[data].emit("you_are_removed", roomObject);
			roomObject.people.splice(roomObject.people.indexOf(data), 1);
			io.sockets.in(roomObject.name).emit("member_in_chatroom", roomObject);
			username[data].leave(socket.room);
			username[data].room = null;
		}
	});

	socket.on("delete_this_room", function (data) {
		//remove the room from room list and get eveyone currently in the room out
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name === socket.room) {
				roomObject = roomList[i];
				break;
			}
		}
		for (i = 0; i < roomObject.people.length; i++) {
			username[roomObject.people[i]].emit("you_are_removed", roomObject);
			username[roomObject.people[i]].room = null;
		}
		roomList.splice(roomList.indexOf(roomObject), 1);
		roomname.splice(roomname.indexOf(socket.room), 1);
		io.sockets.emit("open_room_to_client", { room_list: roomList, user: socket.username });


	});


	socket.on("leave_this_room", function (data) {
		//when you leave the room
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name === socket.room) {
				roomObject = roomList[i];
				break;
			}
		}

		roomObject.people.splice(roomObject.people.indexOf(socket.username), 1);
		io.sockets.in(roomObject.name).emit("member_in_chatroom", roomObject);
		socket.leave(socket.room);
		username[socket.username].emit("you_are_removed", roomObject);
		username[socket.username].room = null;


	});


	socket.on("ban_user", function (data) {
		//check if username exits in the entire page, then if yes, add them to ban list of the particular room
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name === socket.room) {
				roomObject = roomList[i];
				break;
			}
		}
		if (!username[data]) {
			username[socket.username].emit("error_remove_user", "User not found!");
		} else {
			roomObject.banList.push(data);
			if (roomObject.people.indexOf(data) !== -1) {
				username[data].emit("you_are_banned", roomObject);
				roomObject.people.splice(roomObject.people.indexOf(data), 1);
				io.sockets.in(roomObject.name).emit("member_in_chatroom", roomObject);
				username[data].leave(socket.room);
				username[data].room = null;
			}
		}
	});

	socket.on("send_user_server", function (data, callback) {
		//chek if a username exits in the chat page, if yes, display error and let user input a different name 
		if (data.username in username) {
			callback(false);
		} else {
			callback(true);
			socket.username = data["username"];
			username[socket.username] = socket;
			//username.push(data["username"]);
			io.sockets.emit("user_to_client", { user: Object.keys(username) });
			io.sockets.emit("open_room_to_client", { room_list: roomList });
			username[socket.username].emit("welcome_to_page", { myself: socket.username });

		}
	});

	socket.on("disconnect", function (data) {
		//check when someone disconnet from the entire page
		if (!socket.username) return;
		delete username[socket.username];
		//username.splice(username.indexOf(socket.username), 1);
		if (socket.room) {
			var previous = null;
			for (i = 0; i < roomList.length; i++) {
				if (roomList[i].name === socket.room) {
					previous = roomList[i];
					break;
				}
			}

			previous.people.splice(previous.people.indexOf(socket.username), 1);
			io.sockets.in(previous.name).emit("member_in_chatroom", previous);
			socket.leave(socket.room);

		}
		io.sockets.emit("user_to_client", { user: Object.keys(username) });
	});

	socket.on("create_room", function (data, callback) {
		//create room, add room to room list when someone create a room 
		if (roomname.indexOf(data.roomname) != -1) {
			callback({ bool: false, room: "" });
		} else {
			if (socket.room) {
				var previous = null;
				for (i = 0; i < roomList.length; i++) {
					if (roomList[i].name === socket.room) {
						previous = roomList[i];
						break;
					}
				}

				previous.people.splice(previous.people.indexOf(socket.username), 1);
				io.sockets.in(previous.name).emit("member_in_chatroom", previous);
				socket.leave(socket.room);
			}
			var bool_private = false;
			if (data.roomType === "Private") {
				bool_private = true;
			}
			var created_room = new Room(data.roomname, socket.username, bool_private, data.password);
			created_room.addMember(socket.username);
			callback({ bool: true, room: created_room });
			//socket.username = data["username"];
			roomname.push(data.roomname);
			roomList.push(created_room);
			socket.room = data.roomname;
			socket.join(socket.room);
			io.sockets.emit("open_room_to_client", { room_list: roomList, user: socket.username });
			io.sockets.in(socket.room).emit("member_in_chatroom", created_room);
			username[socket.username].emit("ban_and_remove", created_room);
			username[socket.username].emit("delete_room", created_room);


			//io.sockets.emit("connect_to_room", {roomInfo: created_room});

		}
	});
	/*
	socket.on("change_background", function(data) {
		io.sockets.in(socket.room).emit("change_background_now", {usern: socket.username, url:data});
	});*/

	function leavingRoom(data) {
		//remove the person from the people list of people in the room 
		if (socket.room) {
			if (socket.room != data) {
				var previous = null;
				for (i = 0; i < roomList.length; i++) {
					if (roomList[i].name === socket.room) {
						previous = roomList[i];
						break;
					}
				}

				previous.people.splice(previous.people.indexOf(socket.username), 1);
				console.log("previous room " + previous.name);
				io.sockets.in(previous.name).emit("member_in_chatroom", previous);
				socket.leave(socket.room);
			}
		}
	}

	socket.on("join_room", function (data, callback) {
		//add the person to the people list, remove that person from the previous room list, check if they are owner of the room, let them have the power to ban, remove and delete
		var roomObject = roomList[0];
		for (i = 0; i < roomList.length; i++) {
			if (roomList[i].name === data.name) {
				roomObject = roomList[i];
				break;
			}
		}
		if (roomObject.banList.indexOf(socket.username) == -1) {
			leavingRoom(data.name);

			if (roomObject.owner !== socket.username) {
				console.log("not owner");
				username[socket.username].emit("hide_delete_room", roomObject);
				username[socket.username].emit("hide_ban_and_remove", roomObject);
			} else {
				console.log("owner re enter");
				username[socket.username].emit("delete_room", roomObject);
				username[socket.username].emit("ban_and_remove", roomObject);
			}
			if (roomObject.privatebool) {
				//console.log("private:" + roomObject.privatebool + " pass: " + data.pass + " enter: " + roomObject.password);
				if (data.pass === roomObject.password) {
					if (roomObject.people.indexOf(socket.username) == -1) {
						roomObject.addMember(socket.username);
					}
					callback(roomObject);
					socket.room = roomObject.name;
					socket.join(socket.room);
					io.sockets.emit("open_room_to_client", { room_list: roomList, user: socket.username });
					console.log("currentroom: " + roomObject.name);
					io.sockets.in(roomObject.name).emit("member_in_chatroom", roomObject);
				} else {
					username[socket.username].emit("error_message", "Incorrect password");
				}
			} else {
				if (roomObject.people.indexOf(socket.username) == -1) {
					roomObject.addMember(socket.username);
				}
				callback(roomObject);
				socket.room = roomObject.name;
				socket.join(socket.room);
				io.sockets.emit("open_room_to_client", { room_list: roomList, user: socket.username });
				console.log("currentroom: " + roomObject.name);
				io.sockets.in(roomObject.name).emit("member_in_chatroom", roomObject);
			}
		} else {
			username[socket.username].emit("ban_message", roomObject);
		}
	});








});
