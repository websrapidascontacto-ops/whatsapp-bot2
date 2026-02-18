const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  chatId: { type: String, required: true },      // Número o ID del chat
  type: { type: String, enum: ["text","image","audio"], default: "text" },
  text: { type: String, default: "" },
  mediaUrl: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);
