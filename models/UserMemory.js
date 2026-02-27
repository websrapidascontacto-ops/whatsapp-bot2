const mongoose = require("mongoose");

const schema = new mongoose.Schema({
    chatId: String,
    lastIntent: String,
    lastInteraction: Date,
    metadata: Object
});

module.exports = mongoose.model("UserMemory", schema);