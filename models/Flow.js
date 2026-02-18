const mongoose = require("mongoose");

const FlowSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  data: Object
});

module.exports = mongoose.model("Flow",FlowSchema);
