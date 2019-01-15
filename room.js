function Room(name, owner, privatebool, password) {
  this.name = name;
  this.owner = owner;
  this.banList = [];
  this.people = [];
  this.status = "available";
  this.privatebool = privatebool;
  this.password = password;
};

Room.prototype.addMember = function (username) {
  if (this.status === "available") {
    this.people.push(username);
  }
};



module.exports = Room;