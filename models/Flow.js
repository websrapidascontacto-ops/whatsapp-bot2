const mongoose = require("mongoose");

const FlowSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  nodes: Array,
  edges: Array
});

module.exports = mongoose.model("Flow", FlowSchema);
