const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});

UserSchema.pre("save", async function(){
  if(!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password,10);
});

UserSchema.methods.comparePassword = function(password){
  return bcrypt.compare(password,this.password);
};

module.exports = mongoose.model("User",UserSchema);
