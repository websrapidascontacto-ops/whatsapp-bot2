const jwt = require("jsonwebtoken");

module.exports = function(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({error:"No token"});
  try{
    const decoded = jwt.verify(token,"secretkey");
    req.user = decoded;
    next();
  }catch{
    res.status(401).json({error:"Invalid token"});
  }
};
